import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cursor } from "../src/adapters/cursor.ts";
import { MalformedConfigError, readConfig } from "../src/mcp-config.ts";

const MCP_URL = "https://kong-proxy-pilot.jitera.app/gateway/boost-06/mcp";

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), "jc-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "jc-proj-"));
  return { home, cwd };
}

test("cursor is detected only when its config directory exists", () => {
  const { home } = sandbox();
  assert.equal(cursor.detect({ home }), false);
  mkdirSync(join(home, ".cursor"));
  assert.equal(cursor.detect({ home }), true);
});

test("install writes an http server entry with an env reference, not the key", () => {
  const { home, cwd } = sandbox();
  const { path } = cursor.install({ scope: "project", home, cwd, mcpUrl: MCP_URL });

  const written = JSON.parse(readFileSync(path, "utf8"));
  const server = written.mcpServers.jitera;
  assert.equal(server.type, "http");
  assert.equal(server.url, MCP_URL);
  assert.equal(server.headers.Authorization, "Bearer ${env:JITERA_API_KEY}");
  assert.ok(!JSON.stringify(written).includes("sk-"), "no secret may be written to disk");
});

test("install is idempotent", () => {
  const { home, cwd } = sandbox();
  const first = cursor.install({ scope: "project", home, cwd, mcpUrl: MCP_URL });
  const firstBytes = readFileSync(first.path, "utf8");
  assert.equal(first.changed, true);

  const second = cursor.install({ scope: "project", home, cwd, mcpUrl: MCP_URL });
  assert.equal(second.changed, false);
  assert.equal(readFileSync(second.path, "utf8"), firstBytes);
});

test("install preserves unrelated servers and unrelated top level keys", () => {
  const { home, cwd } = sandbox();
  const path = join(cwd, ".cursor", "mcp.json");
  mkdirSync(join(cwd, ".cursor"), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      mcpServers: { linear: { url: "https://mcp.linear.app/sse" } },
      someOtherSetting: { keepMe: true },
    })
  );

  cursor.install({ scope: "project", home, cwd, mcpUrl: MCP_URL });

  const written = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(written.mcpServers.linear.url, "https://mcp.linear.app/sse");
  assert.deepEqual(written.someOtherSetting, { keepMe: true });
  assert.ok(written.mcpServers.jitera);
});

test("dry run reports the change without touching disk", () => {
  const { home, cwd } = sandbox();
  const result = cursor.install({ scope: "project", home, cwd, mcpUrl: MCP_URL, dryRun: true });
  assert.equal(result.changed, true);
  assert.equal(existsSync(result.path), false);
});

test("user scope writes under the home directory", () => {
  const { home, cwd } = sandbox();
  const { path } = cursor.install({ scope: "user", home, cwd, mcpUrl: MCP_URL });
  assert.equal(path, join(home, ".cursor", "mcp.json"));
});

test("uninstall removes only the jitera server", () => {
  const { home, cwd } = sandbox();
  const path = join(cwd, ".cursor", "mcp.json");
  mkdirSync(join(cwd, ".cursor"), { recursive: true });
  writeFileSync(path, JSON.stringify({ mcpServers: { linear: { url: "https://x" } } }));

  cursor.install({ scope: "project", home, cwd, mcpUrl: MCP_URL });
  cursor.uninstall({ scope: "project", home, cwd });

  const written = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(written.mcpServers.jitera, undefined);
  assert.equal(written.mcpServers.linear.url, "https://x");
});

test("a malformed existing config fails loudly instead of being overwritten", () => {
  const { home, cwd } = sandbox();
  mkdirSync(join(cwd, ".cursor"), { recursive: true });
  const path = join(cwd, ".cursor", "mcp.json");
  writeFileSync(path, "{ this is not json");

  assert.throws(
    () => cursor.install({ scope: "project", home, cwd, mcpUrl: MCP_URL }),
    (err) => {
      assert.ok(err instanceof MalformedConfigError);
      assert.match(err.message, /not valid JSON/);
      return true;
    }
  );
  assert.equal(readFileSync(path, "utf8"), "{ this is not json");
});

test("an empty existing config file is treated as empty rather than malformed", () => {
  const { home, cwd } = sandbox();
  mkdirSync(join(cwd, ".cursor"), { recursive: true });
  writeFileSync(join(cwd, ".cursor", "mcp.json"), "\n");
  assert.deepEqual(readConfig(join(cwd, ".cursor", "mcp.json")), {});
});

test("skills directories cover both cross-tool locations", () => {
  const { home, cwd } = sandbox();
  const dirs = cursor.skillsDirs({ scope: "project", home, cwd });
  assert.ok(dirs.some((d) => d.endsWith(join(".agents", "skills"))));
  assert.ok(dirs.some((d) => d.endsWith(join(".claude", "skills"))));
});
