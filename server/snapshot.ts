import { mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface RenderOptions {
  title?: string;
  node_to_frame?: Record<string, number>;
  workspace: string;
}

export function saveSnapshot(type: string, payload: string, options: RenderOptions): void {
  try {
    const { workspace } = options;
    const root = process.env.WHITEBOARD_SNAPSHOTS_DIR ?? join(homedir(), ".agent-whiteboard");
    const dir = join(root, workspace);
    mkdirSync(dir, { recursive: true });

    const now = new Date();
    const filename = `${formatTimestamp(now)}_screen.json`;

    const content: Record<string, unknown> = {
      timestamp: now.toISOString(),
      workspace,
      type,
      payload,
    };
    if (options.title !== undefined || options.node_to_frame !== undefined) {
      const cleanedOptions: Record<string, unknown> = {};
      if (options.title !== undefined) cleanedOptions.title = options.title;
      if (options.node_to_frame !== undefined) cleanedOptions.node_to_frame = options.node_to_frame;
      content.options = cleanedOptions;
    }

    writeFileSync(join(dir, filename), JSON.stringify(content, null, 2), "utf-8");
  } catch (err) {
    console.error(
      "[agent-whiteboard] snapshot write failed:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
