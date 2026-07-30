import test from "node:test";
import assert from "node:assert/strict";

import { DISCOVERY_PATHS, DiscoveryError, discoverDeployment } from "../src/discovery.ts";

const CONFIG = {
  mcpUrl: "https://kong-proxy-pilot.jitera.app/gateway/boost-04/mcp",
  apiBaseUrl: "https://kong-proxy-pilot.jitera.app/gateway/boost-04/v1",
  brand: "Jitera",
};

function fetchStub(
  responder: (url: string) => { status: number; body?: unknown } | undefined
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const result = responder(url);
    if (!result) throw new Error("connection refused");
    return new Response(result.body === undefined ? "" : JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("the studio deployment supplies the mcp url", async () => {
  const config = await discoverDeployment({
    environment: "studio-04",
    fetchImpl: fetchStub((url) =>
      url === `https://studio-04.pilot.jitera.app${DISCOVERY_PATHS[0]}`
        ? { status: 200, body: CONFIG }
        : { status: 404 }
    ),
  });
  assert.deepEqual(config, CONFIG);
});

test("discovery asks the studio matching the environment name", async () => {
  const seen: string[] = [];
  await discoverDeployment({
    environment: "studio-stage",
    fetchImpl: fetchStub((url) => {
      seen.push(url);
      return { status: 200, body: CONFIG };
    }),
  });
  assert.ok(seen[0]?.startsWith("https://studio-stage.pilot.jitera.app"));
});

test("production is the default target", async () => {
  const seen: string[] = [];
  await discoverDeployment({
    fetchImpl: fetchStub((url) => {
      seen.push(url);
      return { status: 200, body: CONFIG };
    }),
  });
  assert.ok(seen[0]?.startsWith("https://studio.jitera.app"));
});

test("a deployment serving at the root path is still found", async () => {
  const config = await discoverDeployment({
    fetchImpl: fetchStub((url) =>
      url.endsWith(DISCOVERY_PATHS[1]) ? { status: 200, body: CONFIG } : { status: 404 }
    ),
  });
  assert.equal(config.mcpUrl, CONFIG.mcpUrl);
});

test("a self hosted brand is carried through", async () => {
  const config = await discoverDeployment({
    fetchImpl: fetchStub(() => ({
      status: 200,
      body: { mcpUrl: "https://mcp.acme.internal/mcp", apiBaseUrl: "", brand: "Acme AI" },
    })),
  });
  assert.equal(config.brand, "Acme AI");
  assert.equal(config.mcpUrl, "https://mcp.acme.internal/mcp");
});

test("a missing brand falls back rather than rendering empty", async () => {
  const config = await discoverDeployment({
    fetchImpl: fetchStub(() => ({ status: 200, body: { mcpUrl: "https://x/mcp" } })),
  });
  assert.equal(config.brand, "Jitera");
});

test("a response without an mcpUrl is rejected, not half trusted", async () => {
  await assert.rejects(
    () => discoverDeployment({ fetchImpl: fetchStub(() => ({ status: 200, body: { brand: "x" } })) }),
    (error: unknown) => {
      assert.ok(error instanceof DiscoveryError);
      assert.match(error.message, /did not contain an mcpUrl/);
      return true;
    }
  );
});

test("an html error page is rejected rather than parsed as config", async () => {
  await assert.rejects(
    () =>
      discoverDeployment({
        fetchImpl: (async () =>
          new Response("<!doctype html><html>not found</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          })) as typeof fetch,
      }),
    DiscoveryError
  );
});

test("an unreachable studio names every path it tried", async () => {
  await assert.rejects(
    () => discoverDeployment({ environment: "studio-04", fetchImpl: fetchStub(() => undefined) }),
    (error: unknown) => {
      assert.ok(error instanceof DiscoveryError);
      assert.equal(error.attempts.length, DISCOVERY_PATHS.length);
      assert.match(error.message, /studio-04\.pilot\.jitera\.app/);
      assert.match(error.message, /--mcp-url/);
      return true;
    }
  );
});

test("an unknown environment fails before any request is made", async () => {
  let called = false;
  await assert.rejects(
    () =>
      discoverDeployment({
        environment: "studio-banana",
        fetchImpl: (async () => {
          called = true;
          return new Response("{}");
        }) as typeof fetch,
      }),
    /unknown environment/
  );
  assert.equal(called, false, "a bad environment must not hit the network");
});
