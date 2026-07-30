import test from "node:test";
import assert from "node:assert/strict";
import {
  UnknownEnvironmentError,
  resolveApiBaseUrl,
  resolveMcpUrl,
  SUPPORTED_ENVIRONMENTS,
} from "../src/environments.mjs";

test("no environment resolves to production", () => {
  for (const value of [undefined, null, ""]) {
    assert.equal(resolveMcpUrl(value), "https://gateway-proxy.jitera.app/gateway/boost/mcp");
  }
});

test("studio resolves to production", () => {
  assert.equal(resolveMcpUrl("studio"), "https://gateway-proxy.jitera.app/gateway/boost/mcp");
});

test("studio-stage resolves to the stage gateway", () => {
  assert.equal(
    resolveMcpUrl("studio-stage"),
    "https://jitera-stage-pilot.jitera.app/gateway/boost/mcp"
  );
});

test("numbered pilots resolve to the pilot gateway with an instance path", () => {
  assert.equal(
    resolveMcpUrl("studio-06"),
    "https://kong-proxy-pilot.jitera.app/gateway/boost-06/mcp"
  );
  assert.equal(
    resolveMcpUrl("studio-01"),
    "https://kong-proxy-pilot.jitera.app/gateway/boost-01/mcp"
  );
  assert.equal(
    resolveMcpUrl("studio-12"),
    "https://kong-proxy-pilot.jitera.app/gateway/boost-12/mcp"
  );
});

test("single digit pilots are zero padded to match deployment labels", () => {
  assert.equal(
    resolveMcpUrl("studio-6"),
    "https://kong-proxy-pilot.jitera.app/gateway/boost-06/mcp"
  );
});

test("environment names are case insensitive and trimmed", () => {
  assert.equal(
    resolveMcpUrl("  STUDIO-06 "),
    "https://kong-proxy-pilot.jitera.app/gateway/boost-06/mcp"
  );
});

test("an unknown environment fails with a message naming what is supported", () => {
  assert.throws(
    () => resolveMcpUrl("studio-banana"),
    (err) => {
      assert.ok(err instanceof UnknownEnvironmentError);
      assert.match(err.message, /studio-banana/);
      assert.match(err.message, /studio-stage/);
      assert.match(err.message, /studio-06/);
      return true;
    }
  );
});

test("a bare pilot number is rejected rather than guessed at", () => {
  assert.throws(() => resolveMcpUrl("06"), UnknownEnvironmentError);
});

test("api base url mirrors the mcp url", () => {
  assert.equal(resolveApiBaseUrl(), "https://gateway-proxy.jitera.app/gateway/boost/v1");
  assert.equal(
    resolveApiBaseUrl("studio-06"),
    "https://kong-proxy-pilot.jitera.app/gateway/boost-06/v1"
  );
  assert.equal(
    resolveApiBaseUrl("studio-stage"),
    "https://jitera-stage-pilot.jitera.app/gateway/boost/v1"
  );
});

test("the production default matches the plugin manifest default", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(
    readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8")
  );
  assert.equal(manifest.userConfig.jitera_mcp_url.default, resolveMcpUrl());
});

test("supported environments are documented for error messages", () => {
  assert.ok(SUPPORTED_ENVIRONMENTS.length >= 3);
});
