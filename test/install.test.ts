import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  BEGIN_MARKER,
  END_MARKER,
  ensureClaudeImport,
  upsertBlock,
  writeAgentsMd,
} from "../src/install/agents-md.ts";
import { DEFAULT_BRAND, UnresolvedTokenError, render } from "../src/install/render.ts";
import { installSkills, listSkills, uninstallSkills } from "../src/install/skills.ts";
import { ROOT, isolatedTmpdir } from "./helpers.ts";

const VALUES = { BRAND: DEFAULT_BRAND };

test("render substitutes a known token", () => {
  assert.equal(render("Hello {{BRAND}}", VALUES), "Hello Jitera");
});

test("render tolerates whitespace inside braces", () => {
  assert.equal(render("Hello {{ BRAND }}", VALUES), "Hello Jitera");
});

test("render refuses to emit an unresolved token", () => {
  assert.throws(
    () => render("{{BRAND}} at {{MCP_URL}}", VALUES),
    (error: unknown) => {
      assert.ok(error instanceof UnresolvedTokenError);
      assert.deepEqual(error.tokens, ["MCP_URL"]);
      return true;
    }
  );
});

test("every shipped skill is discovered", () => {
  const skills = listSkills(ROOT);
  assert.deepEqual(skills, ["jitera-context", "jitera-memory", "jitera-setup", "jitera-specs"]);
});

test("skills are installed into every target directory, fully rendered", () => {
  const target = join(isolatedTmpdir(), ".agents", "skills");
  const result = installSkills({ packageRoot: ROOT, targetDirs: [target], values: VALUES });

  assert.equal(result.changed, true);
  for (const skill of result.skills) {
    const written = readFileSync(join(target, skill, "SKILL.md"), "utf8");
    assert.ok(!written.includes("{{"), `${skill} shipped an unrendered token`);
    assert.ok(written.includes(DEFAULT_BRAND));
  }
});

test("skills install into both cross-tool locations", () => {
  const root = isolatedTmpdir();
  const dirs = [join(root, ".agents", "skills"), join(root, ".claude", "skills")];
  installSkills({ packageRoot: ROOT, targetDirs: dirs, values: VALUES });
  for (const dir of dirs) {
    assert.ok(existsSync(join(dir, "jitera-memory", "SKILL.md")));
  }
});

test("installing twice changes nothing the second time", () => {
  const target = join(isolatedTmpdir(), "skills");
  assert.equal(installSkills({ packageRoot: ROOT, targetDirs: [target], values: VALUES }).changed, true);
  assert.equal(installSkills({ packageRoot: ROOT, targetDirs: [target], values: VALUES }).changed, false);
});

test("a dry run reports the change without touching disk", () => {
  const target = join(isolatedTmpdir(), "skills");
  const result = installSkills({
    packageRoot: ROOT,
    targetDirs: [target],
    values: VALUES,
    dryRun: true,
  });
  assert.equal(result.changed, true);
  assert.equal(existsSync(target), false);
});

test("unrelated skills from other tools are left alone", () => {
  const target = join(isolatedTmpdir(), "skills");
  mkdirSync(join(target, "someone-elses-skill"), { recursive: true });
  writeFileSync(join(target, "someone-elses-skill", "SKILL.md"), "not ours", "utf8");

  installSkills({ packageRoot: ROOT, targetDirs: [target], values: VALUES });
  assert.equal(readFileSync(join(target, "someone-elses-skill", "SKILL.md"), "utf8"), "not ours");

  uninstallSkills({ packageRoot: ROOT, targetDirs: [target] });
  assert.ok(existsSync(join(target, "someone-elses-skill")), "uninstall must not touch other skills");
  assert.equal(existsSync(join(target, "jitera-memory")), false);
});

test("a fresh AGENTS.md is created from the template", () => {
  const project = isolatedTmpdir();
  const result = writeAgentsMd({ packageRoot: ROOT, projectRoot: project, values: VALUES });
  const written = readFileSync(result.agentsPath, "utf8");
  assert.equal(result.agents.action, "created");
  assert.ok(written.startsWith(BEGIN_MARKER));
  assert.ok(written.trim().endsWith(END_MARKER));
  assert.ok(!written.includes("{{"));
});

test("an existing AGENTS.md keeps its own content", () => {
  const project = isolatedTmpdir();
  writeFileSync(join(project, "AGENTS.md"), "# Our rules\n\nUse tabs.\n", "utf8");
  writeAgentsMd({ packageRoot: ROOT, projectRoot: project, values: VALUES });
  const written = readFileSync(join(project, "AGENTS.md"), "utf8");
  assert.match(written, /# Our rules/);
  assert.match(written, /Use tabs\./);
  assert.ok(written.includes(BEGIN_MARKER));
});

test("only the delimited block is replaced on reinstall", () => {
  const before = `# Our rules\n\n${BEGIN_MARKER}\nold content\n${END_MARKER}\n\nkeep this trailer\n`;
  const result = upsertBlock(before, `${BEGIN_MARKER}\nnew content\n${END_MARKER}`);
  assert.match(result.content, /# Our rules/);
  assert.match(result.content, /keep this trailer/);
  assert.match(result.content, /new content/);
  assert.ok(!result.content.includes("old content"));
  assert.equal(result.action, "replaced");
});

test("re-running with identical content reports no change", () => {
  const block = `${BEGIN_MARKER}\nsame\n${END_MARKER}`;
  const once = upsertBlock(undefined, block);
  assert.equal(upsertBlock(once.content, block).changed, false);
});

test("a malformed half-open marker appends rather than corrupting the file", () => {
  const before = `# Rules\n\n${BEGIN_MARKER}\ntruncated, no end marker\n`;
  const result = upsertBlock(before, `${BEGIN_MARKER}\nfresh\n${END_MARKER}`);
  assert.match(result.content, /# Rules/);
  assert.match(result.content, /fresh/);
  assert.equal(result.action, "appended");
});

test("CLAUDE.md gains the AGENTS.md import, because claude code ignores AGENTS.md", () => {
  assert.equal(ensureClaudeImport(undefined).content.trim(), "@AGENTS.md");
  const existing = ensureClaudeImport("# Project\n\nrules here\n");
  assert.ok(existing.content.startsWith("@AGENTS.md"));
  assert.match(existing.content, /rules here/);
});

test("an existing AGENTS.md import is not duplicated", () => {
  const already = "@AGENTS.md\n\n# Project\n";
  assert.equal(ensureClaudeImport(already).changed, false);
});
