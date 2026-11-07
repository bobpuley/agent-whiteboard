// @ts-expect-error plain JS module without type declarations
import * as mod from "../../../bin/install-skills.js";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { installSkills, listBundledSkills, parseArgs, runInstallSkills } = mod;

let root: string;
let src: string;
let dest: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aw-skills-"));
  src = join(root, "src");
  dest = join(root, "dest");
  for (const n of ["alpha", "beta"]) {
    mkdirSync(join(src, n), { recursive: true });
    writeFileSync(join(src, n, "SKILL.md"), `---\nname: ${n}\n---\n`);
  }
  mkdirSync(join(src, "not-a-skill"), { recursive: true }); // no SKILL.md
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("bundled skills", () => {
  it("ships the five whiteboard skills, each with frontmatter", () => {
    const names: string[] = listBundledSkills();
    expect(names).toEqual([
      "agent-whiteboard",
      "whiteboard-analysis",
      "whiteboard-assessment",
      "whiteboard-design",
      "whiteboard-teaching",
    ]);
    for (const n of names) {
      const md = readFileSync(join(mod.BUNDLED_SKILLS_DIR, n, "SKILL.md"), "utf8");
      expect(md).toMatch(new RegExp(`^---\\nname: ${n}\\ndescription: .+\\n---`));
    }
  });
});

describe("installSkills", () => {
  it("lists only directories containing SKILL.md", () => {
    expect(listBundledSkills(src)).toEqual(["alpha", "beta"]);
  });

  it("copies all skills and creates the destination", () => {
    const r = installSkills({ srcDir: src, dest });
    expect(r.installed).toEqual(["alpha", "beta"]);
    expect(existsSync(join(dest, "alpha", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, "not-a-skill"))).toBe(false);
  });

  it("honours --only", () => {
    const r = installSkills({ srcDir: src, dest, only: ["beta"] });
    expect(r.installed).toEqual(["beta"]);
    expect(existsSync(join(dest, "alpha"))).toBe(false);
  });

  it("rejects unknown skill names", () => {
    expect(() => installSkills({ srcDir: src, dest, only: ["nope"] })).toThrow(/unknown skill.*nope/);
  });

  it("does not overwrite without force, and overwrites with force", () => {
    installSkills({ srcDir: src, dest });
    writeFileSync(join(dest, "alpha", "SKILL.md"), "edited");
    const r1 = installSkills({ srcDir: src, dest });
    expect(r1.skipped).toEqual(["alpha", "beta"]);
    expect(readFileSync(join(dest, "alpha", "SKILL.md"), "utf8")).toBe("edited");
    const r2 = installSkills({ srcDir: src, dest, force: true });
    expect(r2.installed).toEqual(["alpha", "beta"]);
    expect(readFileSync(join(dest, "alpha", "SKILL.md"), "utf8")).toContain("name: alpha");
  });
});

describe("parseArgs / runInstallSkills", () => {
  it("parses flags", () => {
    expect(parseArgs(["--project", "--force", "--only", "a, b"])).toMatchObject({
      project: true, force: true, only: ["a", "b"],
    });
    expect(parseArgs(["--dir", "/x"]).dir).toBe("/x");
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => parseArgs(["--wat"])).toThrow(/unknown option/);
    expect(() => parseArgs(["--dir"])).toThrow(/requires a value/);
    expect(() => parseArgs(["--only", "--force"])).toThrow(/requires a value/);
  });

  it("--dir installs the real bundled skills and reports them", () => {
    const out: string[] = [];
    const code = runInstallSkills(["--dir", dest], { log: (s: string) => out.push(s), err: () => {} });
    expect(code).toBe(0);
    expect(existsSync(join(dest, "agent-whiteboard", "SKILL.md"))).toBe(true);
    expect(out.join("\n")).toContain("installed  whiteboard-teaching");
    // second run skips
    const out2: string[] = [];
    runInstallSkills(["--dir", dest], { log: (s: string) => out2.push(s), err: () => {} });
    expect(out2.join("\n")).toContain("skipped    agent-whiteboard");
  });

  it("returns exit code 2 on bad args and 1 on unknown skill; --help/--list return 0", () => {
    const err: string[] = [];
    expect(runInstallSkills(["--bogus"], { log: () => {}, err: (s: string) => err.push(s) })).toBe(2);
    expect(err[0]).toContain("Usage:");
    expect(runInstallSkills(["--dir", dest, "--only", "zzz"], { log: () => {}, err: () => {} })).toBe(1);
    expect(runInstallSkills(["--help"], { log: () => {}, err: () => {} })).toBe(0);
    const out: string[] = [];
    expect(runInstallSkills(["--list"], { log: (s: string) => out.push(s), err: () => {} })).toBe(0);
    expect(out).toContain("whiteboard-design");
  });
});
