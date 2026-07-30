import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin", "jitera-connect.mjs");

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

function runExpectingFailure(args) {
  try {
    execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    return { status: error.status, stderr: error.stderr };
  }
  throw new Error("expected the cli to exit non-zero");
}

test("cli defaults to production", () => {
  const out = JSON.parse(run([]));
  assert.equal(out.mcpUrl, "https://gateway-proxy.jitera.app/gateway/boost/mcp");
  assert.equal(out.apiBaseUrl, "https://gateway-proxy.jitera.app/gateway/boost/v1");
});

test("cli resolves a numbered pilot", () => {
  const out = JSON.parse(run(["--env=studio-06"]));
  assert.equal(out.mcpUrl, "https://kong-proxy-pilot.jitera.app/gateway/boost-06/mcp");
});

test("cli resolves staging", () => {
  const out = JSON.parse(run(["--env=studio-stage"]));
  assert.equal(out.mcpUrl, "https://jitera-stage-pilot.jitera.app/gateway/boost/mcp");
});

test("cli exits 2 on an unknown environment", () => {
  const { status, stderr } = runExpectingFailure(["--env=studio-banana"]);
  assert.equal(status, 2);
  assert.match(stderr, /studio-banana/);
  assert.match(stderr, /studio-06/);
});

test("cli exits 2 on an unrecognised argument", () => {
  const { status, stderr } = runExpectingFailure(["--pilot=06"]);
  assert.equal(status, 2);
  assert.match(stderr, /unrecognised argument/);
});

test("cli prints usage on --help", () => {
  assert.match(run(["--help"]), /--env=studio-stage/);
});
