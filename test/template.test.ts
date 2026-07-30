import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findUnknownTokens } from "../src/validate.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = readFileSync(join(ROOT, "templates", "AGENTS.md.tmpl"), "utf8");

const BEGIN = "<!-- BEGIN JITERA CONNECT -->";
const END = "<!-- END JITERA CONNECT -->";

test("template is delimited by exactly one marker pair", () => {
  assert.equal(template.split(BEGIN).length - 1, 1);
  assert.equal(template.split(END).length - 1, 1);
  assert.ok(template.indexOf(BEGIN) < template.indexOf(END));
});

test("template starts and ends with its markers", () => {
  assert.ok(template.trim().startsWith(BEGIN));
  assert.ok(template.trim().endsWith(END));
});

test("template uses only known tokens", () => {
  assert.deepEqual(findUnknownTokens(template), []);
});

test("template names the tools and the memory discipline", () => {
  const flowed = template.replace(/\s+/g, " ");
  assert.match(flowed, /recall_jitera_memory/);
  assert.match(flowed, /remember_jitera_memory/);
});

test("template tells claude code users to import AGENTS.md", () => {
  assert.match(template, /CLAUDE\.md/);
  assert.match(template, /@AGENTS\.md/);
});
