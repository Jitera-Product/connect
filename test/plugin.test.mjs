import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

test("hooks are declared for session start and stop", () => {
  const hooks = readJson("hooks", "hooks.json").hooks;
  assert.ok(hooks.SessionStart, "SessionStart hook is required");
  assert.ok(hooks.Stop, "Stop hook is required");
  assert.equal(hooks.PreCompact, undefined, "PreCompact cannot inject context");
});

test("hooks use exec form with a resolvable plugin-root path", () => {
  const hooks = readJson("hooks", "hooks.json").hooks;
  for (const event of ["SessionStart", "Stop"]) {
    const entry = hooks[event][0].hooks[0];
    assert.equal(entry.type, "command");
    assert.equal(entry.command, "node");
    assert.match(entry.args[0], /^\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/scripts\/.+\.mjs$/);
    const relative = entry.args[0].replace("${CLAUDE_PLUGIN_ROOT}/", "");
    assert.ok(existsSync(join(ROOT, relative)), `${relative} must exist`);
  }
});

test("plugin manifest does not declare hooks, which are loaded automatically", () => {
  assert.equal(readJson(".claude-plugin", "plugin.json").hooks, undefined);
});

test("codex manifest declares identity and the skills directory", () => {
  const m = readJson(".codex-plugin", "plugin.json");
  assert.equal(m.name, "jitera-connect");
  assert.ok(m.version);
  assert.ok(m.description);
  assert.equal(m.skills, "./skills/");
});

test("codex and claude manifests agree on name and version", () => {
  const codex = readJson(".codex-plugin", "plugin.json");
  const claude = readJson(".claude-plugin", "plugin.json");
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
});

test("codex marketplace lists the plugin", () => {
  const mk = readJson(".agents", "plugins", "marketplace.json");
  const entry = mk.plugins.find((p) => p.name === "jitera-connect");
  assert.ok(entry, "codex marketplace must list jitera-connect");
});
