import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findUnknownTokens } from "../scripts/validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const SKILL_NAMES = ["jitera-memory", "jitera-specs", "jitera-context"];

export function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "SKILL.md must start with YAML frontmatter");
  const out = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

// Skill bodies are hard-wrapped, so phrase assertions run against a
// whitespace-collapsed copy — see test/instructions.test.mjs for the rationale.
function flowed(path) {
  return readFileSync(path, "utf8").replace(/\s+/g, " ");
}

for (const name of SKILL_NAMES) {
  const path = join(ROOT, "skills", name, "SKILL.md");

  test(`${name}: SKILL.md exists`, () => {
    assert.ok(existsSync(path), `missing ${path}`);
  });

  test(`${name}: frontmatter name matches the directory`, () => {
    assert.equal(parseFrontmatter(readFileSync(path, "utf8")).name, name);
  });

  test(`${name}: description is present and within 1024 characters`, () => {
    const d = parseFrontmatter(readFileSync(path, "utf8")).description;
    assert.ok(d && d.length > 0, "description is required");
    assert.ok(d.length <= 1024, `description is ${d.length} chars, max 1024`);
  });

  test(`${name}: description says when to use the skill`, () => {
    const d = parseFrontmatter(readFileSync(path, "utf8")).description;
    assert.match(d, /use when|use before/i);
  });

  test(`${name}: uses no unknown template tokens`, () => {
    assert.deepEqual(findUnknownTokens(readFileSync(path, "utf8")), []);
  });

  test(`${name}: body stays under 500 lines`, () => {
    const lines = readFileSync(path, "utf8").split("\n").length;
    assert.ok(lines <= 500, `${lines} lines, spec recommends under 500`);
  });
}

test("jitera-memory mandates recall before remember", () => {
  const text = flowed(join(ROOT, "skills", "jitera-memory", "SKILL.md"));
  assert.match(text, /recall before you remember/i);
  assert.match(text, /upserts on `name` \+ `type`/i);
});

test("jitera-memory documents the recall retry ladder", () => {
  const text = flowed(join(ROOT, "skills", "jitera-memory", "SKILL.md"));
  assert.match(text, /with no query/i);
});

test("jitera-memory says what not to store", () => {
  const text = readFileSync(join(ROOT, "skills", "jitera-memory", "SKILL.md"), "utf8");
  assert.match(text, /## What not to store/);
});

test("jitera-specs requires searching for an existing spec first", () => {
  const path = join(ROOT, "skills", "jitera-specs", "SKILL.md");
  assert.match(readFileSync(path, "utf8"), /## Before implementing anything/);
  assert.match(flowed(path), /resource_search/);
});

test("jitera-specs states which domains are writable", () => {
  assert.match(flowed(join(ROOT, "skills", "jitera-specs", "SKILL.md")), /only writable domain/i);
});

test("jitera-context documents all three domains", () => {
  const text = readFileSync(join(ROOT, "skills", "jitera-context", "SKILL.md"), "utf8");
  for (const domain of ["documents/", "sources/", "uploads/"]) {
    assert.ok(text.includes(domain), `must document the ${domain} domain`);
  }
});

test("jitera-context documents boolean content search", () => {
  const text = readFileSync(join(ROOT, "skills", "jitera-context", "SKILL.md"), "utf8");
  assert.match(text, /\(api OR rest\) AND controller/);
});

test("jitera-context documents PDF page addressing", () => {
  assert.match(flowed(join(ROOT, "skills", "jitera-context", "SKILL.md")), /page/i);
});
