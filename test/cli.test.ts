import test from "node:test";
import assert from "node:assert/strict";

import { runNode, stubServer, type StubServer } from "./helpers.ts";

const CLI = "dist/bin/cli.js";

const DEPLOYMENT = {
  mcpUrl: "https://kong-proxy-pilot.jitera.app/gateway/boost-04/mcp",
  apiBaseUrl: "https://kong-proxy-pilot.jitera.app/gateway/boost-04/v1",
  brand: "Jitera",
};

function studioStub(config: Record<string, unknown> = DEPLOYMENT): Promise<StubServer> {
  return stubServer((_body, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(config));
  });
}

function studioUrlOf(server: StubServer): string {
  return server.url.replace(/\/mcp$/, "");
}

test("cli prints the endpoints the deployment declares", async () => {
  const studio = await studioStub();
  const { stdout, code } = await runNode(CLI, {
    args: ["--print", "--env=studio-04"],
    env: { JITERA_STUDIO_URL: studioUrlOf(studio) },
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout) as { mcpUrl: string; studioUrl: string };
  assert.equal(parsed.mcpUrl, DEPLOYMENT.mcpUrl);
  assert.equal(parsed.studioUrl, "https://studio-04.pilot.jitera.app");
  await studio.close();
});

test("cli reports which studio it could not reach", async () => {
  const studio = await studioStub();
  const dead = studioUrlOf(studio);
  await studio.close();
  const { stderr, code } = await runNode(CLI, {
    args: ["--print", "--env=studio-04"],
    env: { JITERA_STUDIO_URL: dead },
  });
  assert.equal(code, 1);
  assert.match(stderr, /could not read the deployment configuration/);
  assert.match(stderr, /--mcp-url/);
});

test("cli exits 2 on an unknown environment without touching the network", async () => {
  const { stderr, code } = await runNode(CLI, { args: ["--print", "--env=studio-banana"] });
  assert.equal(code, 2);
  assert.match(stderr, /studio-banana/);
  assert.match(stderr, /studio-06/);
});

test("cli exits 2 on an unrecognised argument", async () => {
  const { stderr, code } = await runNode(CLI, { args: ["--pilot=06"] });
  assert.equal(code, 2);
  assert.match(stderr, /unrecognised argument/);
});

test("cli prints usage on --help", async () => {
  const { stdout } = await runNode(CLI, { args: ["--help"] });
  assert.match(stdout, /--env=studio-stage/);
  assert.match(stdout, /--mcp-url=/);
});

test("an explicit mcp url bypasses discovery entirely", async () => {
  const { stdout, code } = await runNode(CLI, {
    args: ["--print", "--mcp-url=https://self-hosted.example.com/mcp"],
    env: { JITERA_STUDIO_URL: "http://127.0.0.1:1" },
  });
  assert.equal(code, 0);
  assert.equal((JSON.parse(stdout) as { mcpUrl: string }).mcpUrl, "https://self-hosted.example.com/mcp");
});
