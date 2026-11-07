// `agent-whiteboard install-skills` — copies the bundled agent skills into a
// Claude Code skills folder. Plain ESM JS, no dependencies, so it works from
// the npx cache without touching the server or the "open" package.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const BUNDLED_SKILLS_DIR = join(here, "..", "skills");

export const USAGE = `Usage: agent-whiteboard install-skills [options]

Copies the bundled agent skills into a Claude Code skills folder.

Options:
  --project        Install into ./.claude/skills (current project) instead of ~/.claude/skills
  --dir <path>     Install into <path> (overrides --project)
  --only <a,b,c>   Install only the named skills (comma-separated)
  --force          Overwrite skills that already exist
  --list           List the bundled skills and exit
  -h, --help       Show this help`;

export function listBundledSkills(srcDir = BUNDLED_SKILLS_DIR) {
  if (!existsSync(srcDir)) return [];
  return readdirSync(srcDir)
    .filter((n) => statSync(join(srcDir, n)).isDirectory() && existsSync(join(srcDir, n, "SKILL.md")))
    .sort();
}

export function parseArgs(argv) {
  const opts = { project: false, dir: null, only: null, force: false, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") opts.project = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--list") opts.list = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--dir" || a === "--only") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} requires a value`);
      if (a === "--dir") opts.dir = v;
      else opts.only = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else throw new Error(`unknown option: ${a}`);
  }
  return opts;
}

/**
 * Copy skills. Returns { dest, installed, skipped } (skipped = already present, no --force).
 * Throws on unknown --only names.
 */
export function installSkills({ srcDir = BUNDLED_SKILLS_DIR, dest, only = null, force = false }) {
  const available = listBundledSkills(srcDir);
  const names = only ?? available;
  const unknown = names.filter((n) => !available.includes(n));
  if (unknown.length) {
    throw new Error(`unknown skill(s): ${unknown.join(", ")} (available: ${available.join(", ")})`);
  }
  mkdirSync(dest, { recursive: true });
  const installed = [];
  const skipped = [];
  for (const name of names) {
    const target = join(dest, name);
    if (existsSync(target) && !force) {
      skipped.push(name);
      continue;
    }
    cpSync(join(srcDir, name), target, { recursive: true, force: true });
    installed.push(name);
  }
  return { dest, installed, skipped };
}

/** CLI entry. Returns the process exit code. */
export function runInstallSkills(argv, { log = console.log, err = console.error } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    err(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    log(USAGE);
    return 0;
  }
  if (opts.list) {
    for (const n of listBundledSkills()) log(n);
    return 0;
  }
  const dest = opts.dir
    ? resolve(opts.dir)
    : opts.project
      ? resolve(process.cwd(), ".claude", "skills")
      : join(homedir(), ".claude", "skills");
  try {
    const { installed, skipped } = installSkills({ dest, only: opts.only, force: opts.force });
    for (const n of installed) log(`installed  ${n}`);
    for (const n of skipped) log(`skipped    ${n} (already exists; use --force to overwrite)`);
    log(`\nSkills folder: ${dest}`);
    return 0;
  } catch (e) {
    err(`error: ${e.message}`);
    return 1;
  }
}
