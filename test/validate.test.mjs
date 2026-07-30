import test from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_TOKENS,
  INSTRUCTIONS_BUDGET_CHARS,
  findUnknownTokens,
  checkBudget,
} from "../scripts/validate.mjs";

test("known tokens are exactly the three documented ones", () => {
  assert.deepEqual([...KNOWN_TOKENS].sort(), ["BRAND", "DOCS_URL", "MCP_URL"]);
});

test("findUnknownTokens accepts known tokens", () => {
  assert.deepEqual(findUnknownTokens("Hello {{BRAND}} at {{MCP_URL}} see {{DOCS_URL}}"), []);
});

test("findUnknownTokens reports unknown tokens", () => {
  assert.deepEqual(findUnknownTokens("Hi {{BRND}} and {{COMPANY}}"), ["BRND", "COMPANY"]);
});

test("findUnknownTokens deduplicates repeats", () => {
  assert.deepEqual(findUnknownTokens("{{NOPE}} {{NOPE}}"), ["NOPE"]);
});

test("findUnknownTokens tolerates whitespace inside braces", () => {
  assert.deepEqual(findUnknownTokens("{{ BRAND }}"), []);
});

test("checkBudget passes under the limit", () => {
  assert.deepEqual(checkBudget("abc", 10), { ok: true, length: 3 });
});

test("checkBudget fails over the limit", () => {
  assert.deepEqual(checkBudget("abcdefghijk", 10), { ok: false, length: 11 });
});

test("instructions budget is 1400 characters", () => {
  assert.equal(INSTRUCTIONS_BUDGET_CHARS, 1400);
});
