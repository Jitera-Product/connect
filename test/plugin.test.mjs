import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(...parts) {
  return JSON.parse(readFileSync(join(ROOT, ...parts), "utf8"));
}

test("claude plugin manifest declares identity", () => {
  const m = readJson(".claude-plugin", "plugin.json");
  assert.equal(m.name, "jitera-connect");
  assert.ok(m.version, "version is required so updates are explicit");
  assert.ok(m.description);
});

test("claude plugin manifest declares the remote mcp server with a type", () => {
  const server = readJson(".claude-plugin", "plugin.json").mcpServers.jitera;
  assert.equal(server.type, "http");
  assert.ok(server.url);
  assert.match(server.headers.Authorization, /^Bearer \$\{user_config\.jitera_api_key\}$/);
});

test("claude plugin manifest prompts for the api key as a secret", () => {
  const cfg = readJson(".claude-plugin", "plugin.json").userConfig.jitera_api_key;
  assert.equal(cfg.type, "string");
  assert.equal(cfg.sensitive, true);
  assert.equal(cfg.required, true);
  assert.ok(cfg.title && cfg.description);
});

test("claude plugin manifest prompts for an editable mcp url", () => {
  const cfg = readJson(".claude-plugin", "plugin.json").userConfig.jitera_mcp_url;
  assert.equal(cfg.required, true);
  assert.match(cfg.default, /^https:\/\/.+\/mcp$/);
  assert.match(cfg.description, /self-hosted|different/i);
});

test("claude plugin manifest does not declare skills, which are scanned by default", () => {
  const m = readJson(".claude-plugin", "plugin.json");
  assert.equal(m.skills, undefined);
});

test("marketplace lists the plugin at the repository root", () => {
  const mk = readJson(".claude-plugin", "marketplace.json");
  assert.ok(mk.name);
  const entry = mk.plugins.find((p) => p.name === "jitera-connect");
  assert.ok(entry, "marketplace must list jitera-connect");
  assert.equal(entry.source, "./");
});
