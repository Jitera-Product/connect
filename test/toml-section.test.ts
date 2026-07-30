import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureRootKey,
  hasRootKey,
  ownsHeader,
  removeTable,
  splitSections,
  upsertTable,
} from "../src/toml-section.ts";

const EXISTING = `# my codex config
model = "gpt-5"

[mcp_servers.linear]
url = "https://mcp.linear.app/sse"

[mcp_servers.jitera]
url = "https://old.example.com/mcp"

[mcp_servers.jitera.env]
OLD = "value"

[tui]
theme = "dark"
`;

test("sections are split on table headers", () => {
  const headers = splitSections(EXISTING).map((s) => s.header);
  assert.deepEqual(headers, [
    undefined,
    "mcp_servers.linear",
    "mcp_servers.jitera",
    "mcp_servers.jitera.env",
    "tui",
  ]);
});

test("a table owns its own subtables", () => {
  assert.equal(ownsHeader("mcp_servers.jitera", "mcp_servers.jitera"), true);
  assert.equal(ownsHeader("mcp_servers.jitera.env", "mcp_servers.jitera"), true);
  assert.equal(ownsHeader("mcp_servers.jitera_other", "mcp_servers.jitera"), false);
  assert.equal(ownsHeader("mcp_servers.linear", "mcp_servers.jitera"), false);
});

test("removing a table takes its subtables and leaves everything else", () => {
  const result = removeTable(EXISTING, "mcp_servers.jitera");
  assert.ok(!result.includes("old.example.com"));
  assert.ok(!result.includes('OLD = "value"'));
  assert.match(result, /# my codex config/);
  assert.match(result, /model = "gpt-5"/);
  assert.match(result, /mcp\.linear\.app/);
  assert.match(result, /\[tui\]/);
  assert.match(result, /theme = "dark"/);
});

test("upsert replaces an existing table without disturbing neighbours", () => {
  const result = upsertTable(EXISTING, "mcp_servers.jitera", 'url = "https://new.example.com/mcp"');
  assert.match(result, /new\.example\.com/);
  assert.ok(!result.includes("old.example.com"));
  assert.match(result, /mcp\.linear\.app/);
  assert.match(result, /\[tui\]/);
  assert.equal(result.match(/\[mcp_servers\.jitera\]/g)?.length, 1);
});

test("upsert into an empty file produces just the table", () => {
  assert.equal(upsertTable("", "mcp_servers.jitera", 'url = "x"'), '[mcp_servers.jitera]\nurl = "x"\n');
});

test("upsert is idempotent", () => {
  const once = upsertTable(EXISTING, "mcp_servers.jitera", 'url = "https://a/mcp"');
  assert.equal(upsertTable(once, "mcp_servers.jitera", 'url = "https://a/mcp"'), once);
});

test("a file header comment separated by a blank line stays put", () => {
  const source = `# keep me\n\n[mcp_servers.jitera]\nurl = "old"\n\n[tui]\nx = 1\n`;
  const result = upsertTable(source, "mcp_servers.jitera", 'url = "new"');
  assert.match(result, /# keep me/);
});

test("a comment directly above another table belongs to that table, not ours", () => {
  const source = `[mcp_servers.jitera]\nurl = "old"\n# describes tui\n[tui]\nx = 1\n`;
  const result = removeTable(source, "mcp_servers.jitera");
  assert.match(result, /# describes tui/);
  assert.match(result, /\[tui\]/);
  assert.ok(!result.includes("old"));
});

test("a comment directly above our own table is removed with it", () => {
  const source = `[tui]\nx = 1\n# jitera connect\n[mcp_servers.jitera]\nurl = "old"\n`;
  const result = removeTable(source, "mcp_servers.jitera");
  assert.ok(!result.includes("# jitera connect"));
  assert.match(result, /\[tui\]/);
});

test("root keys are detected only in the preamble", () => {
  assert.equal(hasRootKey('model = "gpt-5"\n\n[tui]\nx = 1\n', "model"), true);
  assert.equal(hasRootKey('[tui]\nmodel = "gpt-5"\n', "model"), false);
});

test("a missing root key is added above the first table", () => {
  const result = ensureRootKey(EXISTING, "experimental_use_rmcp_client", "true");
  assert.match(result, /experimental_use_rmcp_client = true/);
  const beforeFirstTable = result.slice(0, result.indexOf("["));
  assert.match(beforeFirstTable, /experimental_use_rmcp_client/);
  assert.match(result, /# my codex config/);
  assert.match(result, /model = "gpt-5"/);
});

test("an existing root key is left exactly as the user wrote it", () => {
  const source = "experimental_use_rmcp_client   =   true\n\n[tui]\nx = 1\n";
  assert.equal(ensureRootKey(source, "experimental_use_rmcp_client", "true"), source);
});

test("ensureRootKey on an empty file writes only the key", () => {
  assert.equal(ensureRootKey("", "flag", "true"), "flag = true\n");
});

test("array of tables headers are recognised as sections", () => {
  const headers = splitSections("[[profiles]]\nname = 'a'\n[[profiles]]\nname = 'b'\n").map(
    (s) => s.header
  );
  assert.deepEqual(headers, [undefined, "profiles", "profiles"]);
});
