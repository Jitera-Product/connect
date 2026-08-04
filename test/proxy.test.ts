import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PassThrough } from "node:stream";

import { configFromEnvironment, runProxy, type ProxyConfig } from "../src/proxy.ts";
import { UnknownEnvironmentError } from "../src/environments.ts";
import { stubServer as jsonStubServer } from "./helpers.ts";

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

async function drive(
  url: string,
  lines: string[],
  config: Partial<ProxyConfig> = {}
): Promise<{ out: string; log: string }> {
  const input = new PassThrough();
  const output = new PassThrough();
  const log = new PassThrough();

  let out = "";
  let logged = "";
  output.on("data", (c: Buffer) => (out += c.toString()));
  log.on("data", (c: Buffer) => (logged += c.toString()));

  const done = runProxy({ url, apiKey: "sk-test", ...config }, { input, output, log });
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

test("configured instructions are injected into an initialize response", async () => {
  const s = await stubServer();
  const { out } = await drive(
    s.url,
    [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })],
    { instructions: "Recall project memory before planning." }
  );
  await s.close();
  const parsed = JSON.parse(out.trim()) as { result: { instructions?: string } };
  assert.equal(parsed.result.instructions, "Recall project memory before planning.");
});

test("instructions the remote already sends are never overwritten", async () => {
  const s = await stubServer((body, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body["id"],
        result: { instructions: "server-owned text" },
      })
    );
  });
  const { out } = await drive(
    s.url,
    [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })],
    { instructions: "local text" }
  );
  await s.close();
  const parsed = JSON.parse(out.trim()) as { result: { instructions?: string } };
  assert.equal(parsed.result.instructions, "server-owned text");
});

test("responses to other methods gain no instructions", async () => {
  const s = await stubServer();
  const { out } = await drive(
    s.url,
    [JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })],
    { instructions: "local text" }
  );
  await s.close();
  const parsed = JSON.parse(out.trim()) as { result: { instructions?: string } };
  assert.equal(parsed.result.instructions, undefined);
});

test("an initialize error response is passed through undecorated", async () => {
  const s = await stubServer((body, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ jsonrpc: "2.0", id: body["id"], error: { code: -32600, message: "no" } })
    );
  });
  const { out } = await drive(
    s.url,
    [JSON.stringify({ jsonrpc: "2.0", id: 3, method: "initialize" })],
    { instructions: "local text" }
  );
  await s.close();
  const parsed = JSON.parse(out.trim()) as { error?: { code: number }; result?: unknown };
  assert.equal(parsed.error?.code, -32600);
  assert.equal(parsed.result, undefined);
});

test("discovery supplies the brand alongside the endpoint", async () => {
  const studio = await jsonStubServer((_body, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ mcpUrl: "https://example.test/mcp", brand: "Acme" }));
  });
  const config = await configFromEnvironment({
    JITERA_API_KEY: "k",
    JITERA_STUDIO_URL: studio.url.replace(/\/mcp$/, ""),
  });
  await studio.close();
  assert.equal(config.brand, "Acme");
});

test("a url override falls back to the default brand", async () => {
  const config = await configFromEnvironment({
    JITERA_MCP_URL: "https://self-hosted.example.com/mcp",
    JITERA_API_KEY: "k",
  });
  assert.equal(config.brand, "Jitera");
});

test("an explicit url override skips discovery entirely", async () => {
  const config = await configFromEnvironment({
    JITERA_ENVIRONMENT: "studio-04",
    JITERA_MCP_URL: "https://self-hosted.example.com/mcp",
    JITERA_API_KEY: "k",
  });
  assert.equal(config.url, "https://self-hosted.example.com/mcp");
  assert.equal(config.apiKey, "k");
});

test("an unknown environment is rejected before any connection is attempted", async () => {
  await assert.rejects(
    () => configFromEnvironment({ JITERA_ENVIRONMENT: "studio-banana", JITERA_API_KEY: "k" }),
    UnknownEnvironmentError
  );
});
