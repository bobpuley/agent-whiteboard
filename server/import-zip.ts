import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extract from "extract-zip";
import { z } from "zod";
import { isValidSnapshotFilename, validateWorkspaceInput } from "./validate.js";
import { findSnapshotFileByIdInWorkspace } from "./snapshot-reader.js";

export type ImportMode = "create" | "merge";

export type ImportZipResult =
  | { ok: true; workspace: string; added: number; updated: number; skipped: number; newestFilename?: string }
  | { ok: false; error: string };

// NF55 — zip-bomb defense. Checked against yauzl's (unverified, attacker
// -controlled) central-directory metadata as extraction proceeds, entry by
// entry — a fast, cheap guard against a small upload that claims to expand
// to an unreasonable size, on top of the 50MB compressed-upload cap already
// enforced by the route's bodyLimit override before this function ever runs.
export interface ImportLimits {
  maxEntryUncompressedBytes?: number;
  maxTotalUncompressedBytes?: number;
  maxEntries?: number;
}

const DEFAULT_LIMITS: Required<ImportLimits> = {
  maxEntryUncompressedBytes: 20 * 1024 * 1024, // 20MB — generous for a snapshot JSON file
  maxTotalUncompressedBytes: 200 * 1024 * 1024, // 200MB total across the whole archive
  maxEntries: 2000,
};

const manifestSchema = z.object({
  formatVersion: z.number(),
  workspace: z.string().min(1),
  exportedAt: z.string(),
  appVersion: z.string(),
  snapshots: z.array(z.string()),
});

interface ParsedIdTimestamp {
  id?: string;
  timestamp?: string;
}

function parseIdTimestamp(raw: string): ParsedIdTimestamp {
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; timestamp?: unknown };
    return {
      id: typeof parsed.id === "string" ? parsed.id : undefined,
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * F40 — picks the filename of the newest (by ISO-8601 timestamp string
 * comparison, same convention as snapshot-reader.ts's own sort) entry among
 * everything actually added/updated by this import, so the caller can load
 * it and switch the client's active workspace as a side effect.
 */
function pickNewestFilename(entries: Array<{ filename: string; timestamp?: string }>): string | undefined {
  const withTimestamp = entries.filter((e): e is { filename: string; timestamp: string } => e.timestamp !== undefined);
  if (withTimestamp.length === 0) return undefined;
  return withTimestamp.reduce((newest, e) => (e.timestamp > newest.timestamp ? e : newest)).filename;
}

/**
 * F39/NF55 — imports an uploaded workspace-export zip (F36's format).
 * Extracts to a fresh temp directory first (never directly into the live
 * snapshots tree) via `extract-zip`, which rejects any entry whose resolved
 * path would escape that directory (zip-slip) as part of its own
 * extraction — confirmed empirically, not just by reading its docs. Only
 * `manifest.json` and the files it explicitly lists are ever trusted; a
 * listed filename is re-validated with `isValidSnapshotFilename()` before
 * being joined into any path, since the manifest itself is just JSON text
 * an attacker could otherwise use to point outside the temp/destination
 * directory even though the zip *entries* themselves are already safe.
 */
export async function importZip(
  zipBuffer: Buffer,
  targetWorkspaceInput: unknown,
  mode: ImportMode,
  root: string,
  limits: ImportLimits = {}
): Promise<ImportZipResult> {
  const { maxEntryUncompressedBytes, maxTotalUncompressedBytes, maxEntries } = { ...DEFAULT_LIMITS, ...limits };

  const validated = validateWorkspaceInput(targetWorkspaceInput);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const targetWorkspace = validated.workspace;

  const tempRoot = await mkdtemp(join(tmpdir(), "agent-whiteboard-import-"));
  const zipPath = join(tempRoot, "upload.zip");
  const extractDir = join(tempRoot, "extracted");

  try {
    await writeFile(zipPath, zipBuffer);
    await mkdir(extractDir, { recursive: true });

    let totalUncompressed = 0;
    let entryCount = 0;
    try {
      await extract(zipPath, {
        dir: extractDir,
        onEntry: (entry) => {
          entryCount++;
          if (entryCount > maxEntries) {
            throw new Error("zip contains too many entries");
          }
          if (entry.uncompressedSize > maxEntryUncompressedBytes) {
            throw new Error("zip contains an entry that is too large");
          }
          totalUncompressed += entry.uncompressedSize;
          if (totalUncompressed > maxTotalUncompressedBytes) {
            throw new Error("zip's total uncompressed size is too large");
          }
        },
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "failed to extract zip" };
    }

    let manifestRaw: string;
    try {
      manifestRaw = await readFile(join(extractDir, "manifest.json"), "utf-8");
    } catch {
      return { ok: false, error: "manifest.json is missing from the zip" };
    }

    let manifestJson: unknown;
    try {
      manifestJson = JSON.parse(manifestRaw);
    } catch {
      return { ok: false, error: "manifest.json is not valid JSON" };
    }

    const manifestResult = manifestSchema.safeParse(manifestJson);
    if (!manifestResult.success) {
      return { ok: false, error: "manifest.json is malformed" };
    }
    const manifest = manifestResult.data;

    const destDir = join(root, targetWorkspace);
    const destExists = await stat(destDir).then(
      () => true,
      () => false
    );

    // F40 — every added/updated file's {filename, timestamp}, so the newest
    // one (by timestamp) can be reported back for the client's post-import
    // POST /snapshots/load. Skipped files are deliberately excluded — nothing
    // about them changed.
    const changed: Array<{ filename: string; timestamp?: string }> = [];

    if (mode === "create") {
      if (destExists) {
        return { ok: false, error: `workspace "${targetWorkspace}" already exists` };
      }
      await mkdir(destDir, { recursive: true });
      let added = 0;
      for (const filename of manifest.snapshots) {
        if (!isValidSnapshotFilename(filename)) continue;
        const srcPath = join(extractDir, filename);
        let raw: string;
        try {
          raw = await readFile(srcPath, "utf-8");
        } catch {
          continue;
        }
        await writeFile(join(destDir, filename), raw, "utf-8");
        added++;
        changed.push({ filename, timestamp: parseIdTimestamp(raw).timestamp });
      }
      return { ok: true, workspace: targetWorkspace, added, updated: 0, skipped: 0, newestFilename: pickNewestFilename(changed) };
    }

    // mode === "merge"
    if (!destExists) {
      return { ok: false, error: `workspace "${targetWorkspace}" does not exist` };
    }
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const filename of manifest.snapshots) {
      if (!isValidSnapshotFilename(filename)) continue;
      let raw: string;
      try {
        raw = await readFile(join(extractDir, filename), "utf-8");
      } catch {
        continue;
      }

      const incoming = parseIdTimestamp(raw);
      if (incoming.id === undefined) {
        // Legacy/id-less (pre-v0.11) — always imported as new, never matched.
        await writeFile(join(destDir, filename), raw, "utf-8");
        added++;
        changed.push({ filename, timestamp: incoming.timestamp });
        continue;
      }

      const existing = await findSnapshotFileByIdInWorkspace(targetWorkspace, incoming.id, root);
      if (existing === null) {
        await writeFile(join(destDir, filename), raw, "utf-8");
        added++;
        changed.push({ filename, timestamp: incoming.timestamp });
        continue;
      }

      const existingTimestamp = parseIdTimestamp(existing.raw).timestamp;
      if (existingTimestamp === incoming.timestamp) {
        skipped++;
        continue;
      }
      if (existingTimestamp !== undefined && incoming.timestamp !== undefined && existingTimestamp > incoming.timestamp) {
        // Destination already has the newer version — nothing to do.
        skipped++;
        continue;
      }

      // Incoming is newer — overwrite (at most one file per id afterward).
      if (existing.filename !== filename) {
        await unlink(join(destDir, existing.filename)).catch(() => {});
      }
      await writeFile(join(destDir, filename), raw, "utf-8");
      updated++;
      changed.push({ filename, timestamp: incoming.timestamp });
    }
    return { ok: true, workspace: targetWorkspace, added, updated, skipped, newestFilename: pickNewestFilename(changed) };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
