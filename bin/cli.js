#!/usr/bin/env node
// Production entrypoint — what `npx agent-whiteboard` actually runs.
//
// Deliberately plain ESM JS (no build step for this file) so it can be listed
// directly in package.json's "bin" field. Resolves dist/client relative to
// its own location (not process.cwd()), since npx invokes this from whatever
// directory the user happens to be in. Imports only the compiled server and
// the "open" dependency — never tsx/vite/concurrently/wait-on, none of which
// are installed for a consumer of the published package.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";
import { startServer } from "../dist/server/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const staticRoot = join(here, "..", "dist", "client");

const PORT = process.env.PORT ?? "3000";
const HOST = process.env.HOST ?? "localhost";

startServer({
  staticRoot,
  onReady: () => {
    open(`http://${HOST}:${PORT}`).catch(() => {
      // Non-fatal — the URL is already printed by startServer(); the user
      // can open it manually if the platform has no default browser handler.
    });
  },
});
