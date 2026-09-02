import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PassThrough } from "node:stream";

import {
  configFromEnvironment,
  resolveProjectUuid,
  runProxy,
  resolveAgents,
  withAgentSelection,
  type ProxyConfig,
} from "../src/proxy.ts";
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

test("the repo's project binding rides every request as a header", async () => {
  const s = await jsonStubServer();
  const { out } = await drive(
    s.url,
    [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })],
    { projectUuid: "proj-42" }
  );
  await s.close();
  assert.equal(s.headers[0]?.["x-jitera-project"], "proj-42");
  // The gateway strips x-* headers, so the binding also rides the query string.
  const query = (s.paths[0] ?? "").split("?")[1] ?? "";
  const payload = new URLSearchParams(query).get("com.jitera.boost");
  assert.ok(payload, "expected the boost payload on the request url");
  const decoded = JSON.parse(Buffer.from(payload as string, "base64").toString("utf8")) as {
    session?: { project_uuid?: string };
  };
  assert.equal(decoded.session?.project_uuid, "proj-42");
  assert.equal((JSON.parse(out.trim()) as { id: number }).id, 1);
});

test("no binding means no project header", async () => {
  const s = await jsonStubServer();
  await drive(s.url, [JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })]);
  await s.close();
  assert.equal(s.headers[0]?.["x-jitera-project"], undefined);
});

test("an explicit JITERA_PROJECT beats the repository marker", async () => {
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { isolatedTmpdir } = await import("./helpers.ts");
  const root = isolatedTmpdir();
  writeFileSync(join(root, ".jitera.json"), JSON.stringify({ project: "from-marker" }), "utf8");

  assert.equal(resolveProjectUuid({ JITERA_PROJECT: "from-env" }, root), "from-env");
  assert.equal(resolveProjectUuid({}, root), "from-marker");
  assert.equal(resolveProjectUuid({}, isolatedTmpdir()), undefined);
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

const callFor = (name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0" as const,
  id: 1,
  method: "tools/call",
  params: { name, arguments: args },
});

test("the repository's agents are applied to a memory call", () => {
  const out = withAgentSelection(callFor("recall_jitera_memory"), ["a1", "a2"]);
  const params = out.params as { arguments: Record<string, unknown> };
  assert.deepEqual(params.arguments["agents"], ["a1", "a2"]);
});

test("gathering context is narrowed the same way", () => {
  const out = withAgentSelection(callFor("gather_jitera_context", { task: "refunds" }), ["a1"]);
  const params = out.params as { arguments: Record<string, unknown> };
  assert.deepEqual(params.arguments["agents"], ["a1"]);
  assert.equal(params.arguments["task"], "refunds", "existing arguments survive");
});

test("a caller that named agents itself is left alone", () => {
  // The caller has been more specific than the repository default.
  const out = withAgentSelection(callFor("recall_jitera_memory", { agents: ["mine"] }), ["a1"]);
  const params = out.params as { arguments: Record<string, unknown> };
  assert.deepEqual(params.arguments["agents"], ["mine"]);
});

test("tools that do not read memory are untouched", () => {
  const request = callFor("resource_search", { content: "refund" });
  assert.equal(withAgentSelection(request, ["a1"]), request);
});

test("no selection changes nothing", () => {
  const request = callFor("recall_jitera_memory");
  assert.equal(withAgentSelection(request, undefined), request);
  assert.equal(withAgentSelection(request, []), request);
});

test("non tool-call traffic passes straight through", () => {
  const request = { jsonrpc: "2.0" as const, id: 2, method: "tools/list" };
  assert.equal(withAgentSelection(request, ["a1"]), request);
});

test("a project override drops the repository's agent ids with it", async () => {
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { isolatedTmpdir } = await import("./helpers.ts");

  const dir = isolatedTmpdir();
  writeFileSync(
    join(dir, ".jitera.json"),
    JSON.stringify({ project: "repo-project", agents: ["a1"] }),
    "utf8"
  );

  assert.deepEqual(resolveAgents(dir, {} as NodeJS.ProcessEnv), ["a1"]);
  // Agent ids belong to the project they were chosen in. Sending them with a
  // different project matches nothing and empties the recall silently.
  assert.equal(
    resolveAgents(dir, { JITERA_PROJECT: "other-project" } as NodeJS.ProcessEnv),
    undefined
  );
});

test("a malformed arguments payload is forwarded rather than thrown on", () => {
  for (const bad of ["a string", [1, 2, 3]]) {
    const request = {
      jsonrpc: "2.0" as const,
      id: 3,
      method: "tools/call",
      params: { name: "recall_jitera_memory", arguments: bad },
    };
    assert.equal(withAgentSelection(request, ["a1"]), request, `${JSON.stringify(bad)}`);
  }
});

test("a call with no arguments at all still gets the selection", () => {
  const request = {
    jsonrpc: "2.0" as const,
    id: 4,
    method: "tools/call",
    params: { name: "recall_jitera_memory" },
  };
  const out = withAgentSelection(request, ["a1"]);
  const params = out.params as { arguments: Record<string, unknown> };
  assert.deepEqual(params.arguments["agents"], ["a1"]);
});
