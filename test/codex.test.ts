import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { codex } from "../src/adapters/codex.ts";
import { isolatedTmpdir } from "./helpers.ts";

const MCP_URL = "https://kong-proxy-pilot.jitera.app/gateway/boost-04/mcp";

function sandbox(existingConfig?: string): { home: string; cwd: string; path: string } {
  const home = isolatedTmpdir();
  const cwd = isolatedTmpdir();
  const path = join(home, ".codex", "config.toml");
  if (existingConfig !== undefined) {
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(path, existingConfig, "utf8");
  }
  return { home, cwd, path };
}

test("codex is detected only when its config directory exists", () => {
  const home = isolatedTmpdir();
  assert.equal(codex.detect({ home }), false);
  mkdirSync(join(home, ".codex"));
  assert.equal(codex.detect({ home }), true);
});

test("install writes the server table and the transport flag", () => {
  const { home, cwd, path } = sandbox();
  const result = codex.install({ scope: "user", home, cwd, mcpUrl: MCP_URL });
  const written = readFileSync(path, "utf8");

  assert.equal(result.changed, true);
  assert.match(written, /\[mcp_servers\.jitera\]/);
  assert.match(written, new RegExp(`url = "${MCP_URL.replace(/[/.]/g, "\\$&")}"`));
  assert.match(written, /bearer_token_env_var = "JITERA_API_KEY"/);
  assert.match(written, /experimental_use_rmcp_client = true/);
});

test("the api key itself is never written to the config", () => {
  const { home, cwd, path } = sandbox();
  codex.install({ scope: "user", home, cwd, mcpUrl: MCP_URL });
  const written = readFileSync(path, "utf8");
  assert.ok(!written.includes("sk-"), "only the env var name may appear, never a key");
});

test("install is idempotent", () => {
  const { home, cwd, path } = sandbox();
  const context = { scope: "user" as const, home, cwd, mcpUrl: MCP_URL };
  assert.equal(codex.install(context).changed, true);
  const first = readFileSync(path, "utf8");
  assert.equal(codex.install(context).changed, false);
  assert.equal(readFileSync(path, "utf8"), first);
});

test("an existing codex config keeps its own servers and settings", () => {
  const existing = `# my config\nmodel = "gpt-5"\n\n[mcp_servers.linear]\nurl = "https://mcp.linear.app/sse"\n\n[tui]\ntheme = "dark"\n`;
  const { home, cwd, path } = sandbox(existing);
  codex.install({ scope: "user", home, cwd, mcpUrl: MCP_URL });
  const written = readFileSync(path, "utf8");

  assert.match(written, /# my config/);
  assert.match(written, /model = "gpt-5"/);
  assert.match(written, /mcp\.linear\.app/);
  assert.match(written, /\[tui\]/);
  assert.match(written, /theme = "dark"/);
  assert.match(written, /\[mcp_servers\.jitera\]/);
});

test("reinstalling replaces our table rather than duplicating it", () => {
  const { home, cwd, path } = sandbox();
  codex.install({ scope: "user", home, cwd, mcpUrl: "https://old.example.com/mcp" });
  codex.install({ scope: "user", home, cwd, mcpUrl: MCP_URL });
  const written = readFileSync(path, "utf8");

  assert.equal(written.match(/\[mcp_servers\.jitera\]/g)?.length, 1);
  assert.ok(!written.includes("old.example.com"));
  assert.match(written, /boost-04/);
});

test("an existing transport flag is not duplicated", () => {
  const { home, cwd, path } = sandbox("experimental_use_rmcp_client = true\n");
  codex.install({ scope: "user", home, cwd, mcpUrl: MCP_URL });
  const written = readFileSync(path, "utf8");
  assert.equal(written.match(/experimental_use_rmcp_client/g)?.length, 1);
});

test("uninstall removes only our table", () => {
  const existing = `[mcp_servers.linear]\nurl = "https://mcp.linear.app/sse"\n`;
  const { home, cwd, path } = sandbox(existing);
  codex.install({ scope: "user", home, cwd, mcpUrl: MCP_URL });
  codex.uninstall({ scope: "user", home, cwd });
  const written = readFileSync(path, "utf8");

  assert.ok(!written.includes("mcp_servers.jitera"));
  assert.match(written, /mcp\.linear\.app/);
});

test("uninstall on a config without our table changes nothing", () => {
  const { home, cwd } = sandbox(`[tui]\ntheme = "dark"\n`);
  assert.equal(codex.uninstall({ scope: "user", home, cwd }).changed, false);
});

test("dry run reports the change without touching disk", () => {
  const { home, cwd, path } = sandbox();
  const result = codex.install({ scope: "user", home, cwd, mcpUrl: MCP_URL, dryRun: true });
  assert.equal(result.changed, true);
  assert.equal(existsSync(path), false);
});

test("codex reads skills from the cross-tool agents directory", () => {
  const { home, cwd } = sandbox();
  assert.deepEqual(codex.skillsDirs({ scope: "project", home, cwd }), [
    join(cwd, ".agents", "skills"),
  ]);
});
