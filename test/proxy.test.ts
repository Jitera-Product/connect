import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PassThrough } from "node:stream";

import { configFromEnvironment, runProxy } from "../src/proxy.ts";
import { UnknownEnvironmentError } from "../src/environments.ts";

interface Stub {
  readonly url: string;
  readonly seen: unknown[];
  readonly close: () => Promise<void>;
}

function stubServer(
  handler?: (body: Record<string, unknown>, res: ServerResponse) => void
): Promise<Stub> {
  const seen: unknown[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw) as Record<string, unknown>;
    seen.push(body);
    if (handler) return handler(body, res);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body["id"], result: { ok: true } }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/mcp`,
        seen,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

async function drive(url: string, lines: string[]): Promise<{ out: string; log: string }> {
  const input = new PassThrough();
  const output = new PassThrough();
  const log = new PassThrough();

  let out = "";
  let logged = "";
  output.on("data", (c: Buffer) => (out += c.toString()));
  log.on("data", (c: Buffer) => (logged += c.toString()));

  const done = runProxy({ url, apiKey: "sk-test" }, { input, output, log });
  for (const line of lines) input.write(`${line}\n`);
  input.end();
  await done;
  return { out, log: logged };
}

test("a request is forwarded and its response written back", async () => {
  const s = await stubServer();
  const { out } = await drive(s.url, [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  ]);
  assert.equal(JSON.parse(out.trim()).id, 1);
  assert.deepEqual((s.seen[0] as Record<string, unknown>)["method"], "initialize");
  await s.close();
});

test("the bearer token is attached by the proxy, never by the caller", async () => {
  let auth: string | undefined;
  const server = createServer(async (req, res) => {
    auth = req.headers.authorization;
    for await (const _ of req) void _;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await drive(`http://127.0.0.1:${port}/mcp`, [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  ]);
  assert.equal(auth, "Bearer sk-test");
  await new Promise<void>((r) => server.close(() => r()));
});

test("notifications get no response written", async () => {
  const s = await stubServer();
  const { out } = await drive(s.url, [
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  ]);
  assert.equal(out.trim(), "");
  await s.close();
});

test("several requests are handled in order", async () => {
  const s = await stubServer();
  const { out } = await drive(s.url, [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "x" } }),
  ]);
  const ids = out.trim().split("\n").map((l) => (JSON.parse(l) as { id: number }).id);
  assert.deepEqual(ids, [1, 2, 3]);
  await s.close();
});

test("an unparseable line is skipped without killing the proxy", async () => {
  const s = await stubServer();
  const { out, log } = await drive(s.url, [
    "}{ not json",
    JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" }),
  ]);
  assert.equal(JSON.parse(out.trim()).id, 7);
  assert.match(log, /unparseable/);
  await s.close();
});

test("a transport failure becomes a jsonrpc error, not a dropped request", async () => {
  const s = await stubServer();
  const dead = s.url;
  await s.close();
  const { out } = await drive(dead, [JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })]);
  const parsed = JSON.parse(out.trim()) as { id: number; error: { code: number } };
  assert.equal(parsed.id, 9);
  assert.equal(parsed.error.code, -32603);
});

test("blank lines are ignored", async () => {
  const s = await stubServer();
  const { out } = await drive(s.url, ["", "   ", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "p" })]);
  assert.equal(out.trim().split("\n").length, 1);
  await s.close();
});

test("config resolves the url from an environment name", () => {
  const config = configFromEnvironment({ JITERA_ENVIRONMENT: "studio-04", JITERA_API_KEY: "k" });
  assert.equal(config.url, "https://kong-proxy-pilot.jitera.app/gateway/boost-04/mcp");
  assert.equal(config.apiKey, "k");
});

test("config defaults to production with no environment set", () => {
  assert.equal(
    configFromEnvironment({ JITERA_API_KEY: "k" }).url,
    "https://gateway-proxy.jitera.app/gateway/boost/mcp"
  );
});

test("an explicit url override wins over the environment name", () => {
  const config = configFromEnvironment({
    JITERA_ENVIRONMENT: "studio-04",
    JITERA_MCP_URL: "https://self-hosted.example.com/mcp",
    JITERA_API_KEY: "k",
  });
  assert.equal(config.url, "https://self-hosted.example.com/mcp");
});

test("an unknown environment is rejected before any connection is attempted", () => {
  assert.throws(
    () => configFromEnvironment({ JITERA_ENVIRONMENT: "studio-banana", JITERA_API_KEY: "k" }),
    UnknownEnvironmentError
  );
});
