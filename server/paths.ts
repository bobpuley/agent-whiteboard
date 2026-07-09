import { homedir } from "os";
import { join } from "path";

/**
 * Canonical snapshots-root resolver (F5, NF22) — the single implementation of
 * `WHITEBOARD_SNAPSHOTS_DIR ?? ~/.agent-whiteboard`, replacing 10 independent
 * copies of this expression previously scattered across app.ts, mcp.ts,
 * snapshot.ts, viewport-cache.ts, and migrate-snapshots.ts.
 */
export function getSnapshotsRoot(): string {
  return process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
}
