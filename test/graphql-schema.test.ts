import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";

import { GraphqlError, createApiKey, listProjects } from "../src/graphql.ts";

function serve(respond: (operation: string, res: ServerResponse) => void): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      const body = JSON.parse(raw) as { operationName?: string };
      respond(body.operationName ?? "", res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function json(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

test("projects are read from the wrapper type the schema actually returns", async () => {
  const server = await serve((_op, res) =>
    json(res, {
      data: {
        projects: {
          projects: [{ uuid: "u1", name: "Acme" }],
          errors: null,
          pagination: { total: 1 },
        },
      },
    })
  );
  const projects = await listProjects({ automationUrl: server.url, accessToken: "t" });
  assert.deepEqual(projects, [{ uuid: "u1", name: "Acme" }]);
  await server.close();
});

test("errors inside the projects wrapper are surfaced", async () => {
  const server = await serve((_op, res) =>
    json(res, { data: { projects: { projects: null, errors: ["blocked by ip allowlist"] } } })
  );
  await assert.rejects(
    () => listProjects({ automationUrl: server.url, accessToken: "t" }),
    (error: unknown) => {
      assert.ok(error instanceof GraphqlError);
      assert.match(error.message, /blocked by ip allowlist/);
      return true;
    }
  );
  await server.close();
});

test("an empty project list is not an error", async () => {
  const server = await serve((_op, res) =>
    json(res, { data: { projects: { projects: [], errors: null } } })
  );
  assert.deepEqual(await listProjects({ automationUrl: server.url, accessToken: "t" }), []);
  await server.close();
});

test("createApiKey reads rawKey from the payload the schema defines", async () => {
  const server = await serve((_op, res) =>
    json(res, {
      data: { createApiKey: { rawKey: "sk-1", errors: null, apiKey: { maskedKey: "sk-…1" } } },
    })
  );
  const created = await createApiKey(
    { projectUuid: "u1", name: "n", mcpAccess: "read_write" },
    { automationUrl: server.url, accessToken: "t" }
  );
  assert.equal(created.rawKey, "sk-1");
  await server.close();
});
