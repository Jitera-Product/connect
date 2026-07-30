import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkBudget,
  findUnknownTokens,
  INSTRUCTIONS_BUDGET_CHARS,
} from "../scripts/validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(ROOT, "content", "instructions.md"), "utf8");

const TOOL_NAMES = ["recall_jitera_memory", "remember_jitera_memory"];

const flowed = text.replace(/\s+/g, " ");

test("instructions stay within the context budget", () => {
  const { ok, length } = checkBudget(text, INSTRUCTIONS_BUDGET_CHARS);
  assert.ok(ok, `instructions are ${length} chars, budget is ${INSTRUCTIONS_BUDGET_CHARS}`);
});

test("instructions use no unknown template tokens", () => {
  assert.deepEqual(findUnknownTokens(text), []);
});

test("instructions never hardcode the brand name, ignoring tool identifiers", () => {
  let stripped = text;
  for (const tool of TOOL_NAMES) stripped = stripped.replaceAll(tool, "");
  assert.ok(!/jitera/i.test(stripped), "use {{BRAND}} instead of a literal brand name");
});

test("instructions name the tools the model must call", () => {
  for (const tool of [
    "recall_jitera_memory",
    "remember_jitera_memory",
    "resource_search",
    "resource_read",
  ]) {
    assert.ok(text.includes(tool), `instructions must mention ${tool}`);
  }
});

test("instructions state that an empty recall is not an error", () => {
  assert.match(flowed, /empty result is normal/i);
});

test("instructions state the recall-before-remember rule", () => {
  assert.match(flowed, /name plus type/i);
});
