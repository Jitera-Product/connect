import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { McpCallError, callTool } from "../src/mcp-client.mjs";

function serve(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}/mcp`,
        close: () => new Promise((done) => server.close(done)),
      })
    );
  });
}

function jsonResponse(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const OK_BODY = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    content: [{ type: "text", text: "MEMORY[checkout]" }],
    structuredContent: { result: "MEMORY[checkout]" },
    isError: false,
  },
};

test("a single post with no handshake returns the tool text", async () => {
  const captured = {};
  const s = await serve(async (req, res) => {
    captured.method = req.method;
    captured.auth = req.headers.authorization;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    captured.body = JSON.parse(raw);
    jsonResponse(res, OK_BODY);
  });

  const text = await callTool({
    url: s.url,
    apiKey: "sk-test",
    name: "recall_jitera_memory",
    args: { query: "checkout" },
  });

  assert.equal(text, "MEMORY[checkout]");
  assert.equal(captured.method, "POST");
  assert.equal(captured.auth, "Bearer sk-test");
  assert.equal(captured.body.method, "tools/call");
  assert.equal(captured.body.params.name, "recall_jitera_memory");
  assert.deepEqual(captured.body.params.arguments, { query: "checkout" });
  await s.close();
});

test("server sent event framing is understood", async () => {
  const s = await serve((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`event: message\ndata: ${JSON.stringify(OK_BODY)}\n\n`);
  });
  assert.equal(
    await callTool({ url: s.url, apiKey: "sk", name: "recall_jitera_memory" }),
    "MEMORY[checkout]"
  );
  await s.close();
});

test("multiple text parts are joined", async () => {
  const s = await serve((req, res) =>
    jsonResponse(res, {
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: "one" }, { type: "text", text: "two" }] },
    })
  );
  assert.equal(await callTool({ url: s.url, apiKey: "sk", name: "t" }), "one\ntwo");
  await s.close();
});

test("a jsonrpc error is surfaced with its message", async () => {
  const s = await serve((req, res) =>
    jsonResponse(res, { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad args" } })
  );
  await assert.rejects(
    () => callTool({ url: s.url, apiKey: "sk", name: "t" }),
    (e) => {
      assert.ok(e instanceof McpCallError);
      assert.match(e.message, /bad args/);
      return true;
    }
  );
  await s.close();
});

test("an isError result is treated as failure, not content", async () => {
  const s = await serve((req, res) =>
    jsonResponse(res, {
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: "read-only api key" }], isError: true },
    })
  );
  await assert.rejects(
    () => callTool({ url: s.url, apiKey: "sk", name: "remember_jitera_memory" }),
    (e) => {
      assert.match(e.message, /read-only api key/);
      return true;
    }
  );
  await s.close();
});

test("an http failure names the status", async () => {
  const s = await serve((req, res) => jsonResponse(res, { error: "nope" }, 403));
  await assert.rejects(
    () => callTool({ url: s.url, apiKey: "sk", name: "t" }),
    (e) => {
      assert.match(e.message, /HTTP 403/);
      return true;
    }
  );
  await s.close();
});

test("a slow server aborts rather than hanging", async () => {
  const s = await serve(() => {});
  await assert.rejects(
    () => callTool({ url: s.url, apiKey: "sk", name: "t", timeoutMs: 150 }),
    (e) => {
      assert.match(e.message, /timed out after 150ms/);
      return true;
    }
  );
  await s.close();
});

test("missing configuration fails before any request", async () => {
  await assert.rejects(() => callTool({ url: "", apiKey: "sk", name: "t" }), /no mcp endpoint/);
  await assert.rejects(() => callTool({ url: "http://x", apiKey: "", name: "t" }), /no api key/);
});

test("an unreadable body is reported rather than crashing", async () => {
  const s = await serve((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("not json");
  });
  await assert.rejects(
    () => callTool({ url: s.url, apiKey: "sk", name: "t" }),
    /unreadable body/
  );
  await s.close();
});
