import test from "node:test";
import assert from "node:assert/strict";

import { McpCallError, callTool, extractText, parseBody } from "../src/mcp-client.ts";
import { stubServer, toolTextServer, type StubServer } from "./helpers.ts";

const OK_BODY = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    content: [{ type: "text", text: "MEMORY[checkout]" }],
    structuredContent: { result: "MEMORY[checkout]" },
    isError: false,
  },
};

async function withServer(server: StubServer, run: (s: StubServer) => Promise<void>): Promise<void> {
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

test("a single post with no handshake returns the tool text", async () => {
  await withServer(await toolTextServer("MEMORY[checkout]"), async (server) => {
    const text = await callTool({
      url: server.url,
      apiKey: "sk-test",
      name: "recall_jitera_memory",
      args: { query: "checkout" },
    });
    assert.equal(text, "MEMORY[checkout]");
    assert.equal(server.headers[0]?.authorization, "Bearer sk-test");
    const body = server.requests[0] as Record<string, unknown>;
    assert.equal(body["method"], "tools/call");
    const params = body["params"] as { name: string; arguments: unknown };
    assert.equal(params.name, "recall_jitera_memory");
    assert.deepEqual(params.arguments, { query: "checkout" });
  });
});

test("server sent event framing is understood", () => {
  const framed = `event: message\ndata: ${JSON.stringify(OK_BODY)}\n\n`;
  assert.equal(extractText(parseBody("text/event-stream", framed)?.result), "MEMORY[checkout]");
});

test("an event stream with no data frame is an error, not silent emptiness", () => {
  assert.throws(() => parseBody("text/event-stream", "event: ping\n\n"), McpCallError);
});

test("an empty body is a valid notification acknowledgement, not a parse failure", () => {
  assert.equal(parseBody("application/json", ""), undefined);
  assert.equal(parseBody("text/event-stream", "   "), undefined);
});

test("multiple text parts are joined", () => {
  assert.equal(
    extractText({ content: [{ type: "text", text: "one" }, { type: "text", text: "two" }] }),
    "one\ntwo"
  );
});

test("non text parts are ignored", () => {
  assert.equal(
    extractText({ content: [{ type: "image" }, { type: "text", text: "kept" }] }),
    "kept"
  );
});

test("a jsonrpc error is surfaced with its message", async () => {
  await withServer(
    await stubServer((body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ jsonrpc: "2.0", id: body["id"], error: { code: -32602, message: "bad args" } })
      );
    }),
    async (server) => {
      await assert.rejects(
        () => callTool({ url: server.url, apiKey: "sk", name: "t" }),
        (error: unknown) => {
          assert.ok(error instanceof McpCallError);
          assert.match(error.message, /bad args/);
          return true;
        }
      );
    }
  );
});

test("an isError result is treated as failure, not content", async () => {
  await withServer(
    await stubServer((body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body["id"],
          result: { content: [{ type: "text", text: "read-only api key" }], isError: true },
        })
      );
    }),
    async (server) => {
      await assert.rejects(
        () => callTool({ url: server.url, apiKey: "sk", name: "remember_jitera_memory" }),
        /read-only api key/
      );
    }
  );
});

test("an http failure names the status", async () => {
  await withServer(
    await stubServer((_body, res) => {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "nope" }));
    }),
    async (server) => {
      await assert.rejects(() => callTool({ url: server.url, apiKey: "sk", name: "t" }), /HTTP 403/);
    }
  );
});

test("a slow server aborts rather than hanging", async () => {
  await withServer(
    await stubServer(() => {}),
    async (server) => {
      await assert.rejects(
        () => callTool({ url: server.url, apiKey: "sk", name: "t", timeoutMs: 150 }),
        /timed out after 150ms/
      );
    }
  );
});

test("missing configuration fails before any request", async () => {
  await assert.rejects(() => callTool({ url: "", apiKey: "sk", name: "t" }), /no mcp endpoint/);
  await assert.rejects(() => callTool({ url: "http://x", apiKey: "", name: "t" }), /no api key/);
});

test("an unreadable body is reported rather than crashing", async () => {
  await withServer(
    await stubServer((_body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("not json");
    }),
    async (server) => {
      await assert.rejects(
        () => callTool({ url: server.url, apiKey: "sk", name: "t" }),
        /unreadable body/
      );
    }
  );
});
