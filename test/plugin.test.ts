import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  readJsonFile,
  type HooksFile,
  type MarketplaceManifest,
  type PluginManifest,
  type StdioServer,
} from "../src/manifest.ts";
import { ROOT } from "./helpers.ts";

const claude = readJsonFile<PluginManifest>(join(ROOT, ".claude-plugin", "plugin.json"));
const codex = readJsonFile<PluginManifest>(join(ROOT, ".codex-plugin", "plugin.json"));
const marketplace = readJsonFile<MarketplaceManifest>(
  join(ROOT, ".claude-plugin", "marketplace.json")
);
const codexMarketplace = readJsonFile<MarketplaceManifest>(
  join(ROOT, ".agents", "plugins", "marketplace.json")
);
const hooks = readJsonFile<HooksFile>(join(ROOT, "hooks", "hooks.json")).hooks;

test("claude plugin manifest declares identity", () => {
  assert.equal(claude.name, "jitera-connect");
  assert.ok(claude.version, "version is required so updates are explicit");
  assert.ok(claude.description);
});

test("claude plugin runs the bundled stdio proxy rather than a raw url", () => {
  const server = claude.mcpServers?.["jitera"] as StdioServer | undefined;
  assert.ok(server, "a jitera server must be declared");
  assert.equal(server.command, "node");
  assert.match(server.args[0] ?? "", /^\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/bin\/proxy\.js$/);
  assert.equal(server.env?.["JITERA_ENVIRONMENT"], "${user_config.environment}");
  assert.equal(server.env?.["JITERA_API_KEY"], "${user_config.jitera_api_key}");
  assert.equal(server.url, undefined, "the endpoint is derived by the proxy, never hardcoded");
});

test("the proxy entry point exists in the built output", () => {
  const server = claude.mcpServers?.["jitera"] as StdioServer;
  const relative = (server.args[0] ?? "").replace("${CLAUDE_PLUGIN_ROOT}/", "");
  assert.ok(existsSync(join(ROOT, relative)), `${relative} must be built and committed`);
});

test("claude plugin manifest prompts for the api key as a secret", () => {
  const option = claude.userConfig?.["jitera_api_key"];
  assert.ok(option);
  assert.equal(option.type, "string");
  assert.equal(option.sensitive, true);
  assert.equal(option.required, true);
  assert.ok(option.title && option.description);
});

test("claude plugin prompts for an environment name, not a url", () => {
  assert.equal(claude.userConfig?.["jitera_mcp_url"], undefined);
  const option = claude.userConfig?.["environment"];
  assert.ok(option);
  assert.equal(option.required, true);
  assert.equal(option.default, "studio");
  assert.match(option.description, /studio-NN|pilot/i);
});

test("the api key is never written into a config value", () => {
  const serialised = JSON.stringify(claude);
  assert.ok(!serialised.includes("sk-"), "no key material may appear in the manifest");
});

test("claude plugin manifest does not declare skills or hooks, which load by default", () => {
  assert.equal(claude.skills, undefined);
  assert.equal(claude.hooks, undefined, "declaring hooks/hooks.json double-loads it");
});

test("marketplace lists the plugin at the repository root", () => {
  assert.ok(marketplace.name);
  const entry = marketplace.plugins.find((p) => p.name === "jitera-connect");
  assert.ok(entry, "marketplace must list jitera-connect");
  assert.equal(entry.source, "./");
});

test("hooks are declared for session start, first prompt, and stop", () => {
  assert.ok(hooks["SessionStart"], "SessionStart hook is required");
  assert.ok(hooks["UserPromptSubmit"], "UserPromptSubmit carries the real memory load");
  assert.ok(hooks["Stop"], "Stop hook is required");
  assert.equal(hooks["PreCompact"], undefined, "PreCompact cannot inject context");
});

test("every hook has a timeout well under the 600 second default", () => {
  for (const entries of Object.values(hooks)) {
    for (const entry of entries) {
      for (const command of entry.hooks) {
        assert.ok(command.timeout, "a hook without a timeout can stall a session");
        assert.ok(command.timeout <= 30, `timeout ${command.timeout}s is too long for a hook`);
      }
    }
  }
});

test("hooks use exec form pointing at built output that exists", () => {
  for (const event of ["SessionStart", "UserPromptSubmit", "Stop"]) {
    const command = hooks[event]?.[0]?.hooks[0];
    assert.ok(command, `${event} must declare a command`);
    assert.equal(command.type, "command");
    assert.equal(command.command, "node");
    const arg = command.args?.[0] ?? "";
    assert.match(arg, /^\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/hooks\/.+\.js$/);
    const relative = arg.replace("${CLAUDE_PLUGIN_ROOT}/", "");
    assert.ok(existsSync(join(ROOT, relative)), `${relative} must be built and committed`);
  }
});

test("codex manifest declares identity and the skills directory", () => {
  assert.equal(codex.name, "jitera-connect");
  assert.ok(codex.version);
  assert.ok(codex.description);
  assert.equal(codex.skills, "./skills/");
});

test("codex and claude manifests agree on name and version", () => {
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
});

test("codex marketplace lists the plugin", () => {
  assert.ok(codexMarketplace.plugins.find((p) => p.name === "jitera-connect"));
});
