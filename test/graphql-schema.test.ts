import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";

import {
  GraphqlError,
  createApiKey,
  listAgents,
  listOrganisations,
  listProjects,
} from "../src/graphql.ts";

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

function recordingServer(
  respond: (operation: string, variables: Record<string, unknown>, res: ServerResponse) => void
): Promise<{
  url: string;
  requests: { operation: string; variables: Record<string, unknown> }[];
  close: () => Promise<void>;
}> {
  const requests: { operation: string; variables: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      const body = JSON.parse(raw) as {
        operationName?: string;
        variables?: Record<string, unknown>;
      };
      const entry = { operation: body.operationName ?? "", variables: body.variables ?? {} };
      requests.push(entry);
      respond(entry.operation, entry.variables, res);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function scopeOf(entry: { variables: Record<string, unknown> }): Record<string, unknown> {
  return (entry.variables["project"] ?? {}) as Record<string, unknown>;
}

const PERSONAL = { slug: "mine", name: "My Team", personal: true };
const TEAM = { slug: "acme", name: "Acme", personal: false };

test("every projects request carries a project argument", async () => {
  const server = await recordingServer((_operation, _vars, res) =>
    json(res, { data: { projects: { projects: [], errors: null } } })
  );

  await listProjects({ automationUrl: server.url, accessToken: "t" });
  const calls = server.requests.filter((r) => r.operation === "ConnectProjects");

  assert.ok(calls.length >= 1);
  for (const call of calls) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(call.variables, "project"),
      "omitting project makes the resolver raise ArgumentError server-side"
    );
    assert.notEqual(call.variables["project"], null);
  }
  await server.close();
});

test("a bounded page size is requested so the default 25 cap is not hit silently", async () => {
  const server = await recordingServer((_operation, _vars, res) =>
    json(res, { data: { projects: { projects: [], errors: null } } })
  );

  await listProjects({ automationUrl: server.url, accessToken: "t" });
  for (const call of server.requests.filter((r) => r.operation === "ConnectProjects")) {
    assert.equal(scopeOf(call)["per"], 100);
  }
  await server.close();
});

test("a team organisation is queried by its own slug only", async () => {
  const server = await recordingServer((_operation, _vars, res) =>
    json(res, { data: { projects: { projects: [], errors: null } } })
  );

  await listProjects({ automationUrl: server.url, accessToken: "t" }, TEAM);
  const scopes = server.requests
    .filter((r) => r.operation === "ConnectProjects")
    .map((r) => scopeOf(r));

  assert.equal(scopes.length, 1);
  assert.equal(scopes[0]?.["organisationSlug"], "acme");
  await server.close();
});

test("a personal organisation also picks up owned and shared projects", async () => {
  const server = await recordingServer((_operation, _vars, res) =>
    json(res, { data: { projects: { projects: [], errors: null } } })
  );

  await listProjects({ automationUrl: server.url, accessToken: "t" }, PERSONAL);
  const scopes = server.requests
    .filter((r) => r.operation === "ConnectProjects")
    .map((r) => scopeOf(r));

  assert.ok(scopes.some((s) => s["onlySharedProjects"] === true));
  assert.ok(scopes.some((s) => s["organisationSlug"] === "mine"));
  assert.ok(scopes.some((s) => !s["onlySharedProjects"] && !s["organisationSlug"]));
  await server.close();
});

test("projects from every scope are merged and deduped by uuid", async () => {
  const server = await recordingServer((_operation, vars, res) => {
    const scope = (vars["project"] ?? {}) as Record<string, unknown>;
    if (scope["organisationSlug"] === "mine") {
      return json(res, {
        data: {
          projects: {
            projects: [
              { uuid: "u1", name: "Shared", canManageApiKey: true },
              { uuid: "u2", name: "Team", canManageApiKey: true },
            ],
            errors: null,
          },
        },
      });
    }
    return json(res, {
      data: { projects: { projects: [{ uuid: "u1", name: "Shared", canManageApiKey: true }], errors: null } },
    });
  });

  const projects = await listProjects({ automationUrl: server.url, accessToken: "t" }, PERSONAL);
  assert.deepEqual(projects.map((p) => p.uuid).sort(), ["u1", "u2"]);
  await server.close();
});

test("canManageApiKey is carried through so the caller can filter on it", async () => {
  const server = await recordingServer((_operation, _vars, res) =>
    json(res, {
      data: {
        projects: {
          projects: [
            { uuid: "u1", name: "Allowed", canManageApiKey: true },
            { uuid: "u2", name: "Denied", canManageApiKey: false },
          ],
          errors: null,
        },
      },
    })
  );

  const projects = await listProjects({ automationUrl: server.url, accessToken: "t" });
  assert.deepEqual(
    projects.filter((p) => p.canManageApiKey).map((p) => p.uuid),
    ["u1"]
  );
  await server.close();
});

test("one failing secondary scope does not lose the personal projects", async () => {
  const server = await recordingServer((_operation, vars, res) => {
    const scope = (vars["project"] ?? {}) as Record<string, unknown>;
    if (scope["onlySharedProjects"] === true) {
      return json(res, { data: { projects: null }, errors: [{ message: "boom" }] });
    }
    return json(res, {
      data: { projects: { projects: [{ uuid: "u1", name: "Mine", canManageApiKey: true }], errors: null } },
    });
  });

  const projects = await listProjects({ automationUrl: server.url, accessToken: "t" });
  assert.deepEqual(projects.map((p) => p.uuid), ["u1"]);
  await server.close();
});

test("organisations report whether they are the personal team", async () => {
  const server = await recordingServer((_operation, _vars, res) =>
    json(res, {
      data: {
        teams: [
          { slug: "mine", name: "My Team", type: "personal" },
          { slug: "acme", name: "Acme", type: "company" },
          { slug: null, name: "Broken", type: "company" },
        ],
      },
    })
  );

  const organisations = await listOrganisations({ automationUrl: server.url, accessToken: "t" });
  assert.deepEqual(organisations, [
    { slug: "mine", name: "My Team", personal: true },
    { slug: "acme", name: "Acme", personal: false },
  ]);
  await server.close();
});

test("a failing teams query degrades to no organisations rather than throwing", async () => {
  const server = await recordingServer((_operation, _vars, res) =>
    json(res, { errors: [{ message: "nope" }] })
  );

  assert.deepEqual(await listOrganisations({ automationUrl: server.url, accessToken: "t" }), []);
  await server.close();
});

test("agents are read from the published workflows of one project", async () => {
  let variables: Record<string, unknown> = {};
  let document = "";
  const server = await serve((_operation, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: {
          boostWorkflows: [
            { id: "a1", name: "Billing", description: "  refunds  " },
            { id: "a2", name: "  ", description: null },
          ],
        },
      })
    );
  });

  const original = globalThis.fetch;
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    const body = JSON.parse(String(args[1]?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    document = body.query;
    variables = body.variables;
    return original(...args);
  };

  const agents = await listAgents(
    { automationUrl: server.url, accessToken: "t" },
    "project-uuid"
  );
  globalThis.fetch = original;
  await server.close();

  assert.equal(variables["projectUuid"], "project-uuid");
  assert.match(document, /boostWorkflows/);
  assert.match(document, /status: \{ _eq: "published" \}/, "drafts are not agents yet");
  assert.deepEqual(agents, [
    { id: "a1", name: "Billing", description: "refunds" },
    { id: "a2", name: "a2", description: null },
  ]);
});

test("rows without an id are dropped rather than offered", async () => {
  const server = await serve((_operation, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: { boostWorkflows: [{ name: "nameless" }, { id: "a1" }] } }));
  });

  const agents = await listAgents({ automationUrl: server.url, accessToken: "t" }, "p");
  await server.close();
  assert.deepEqual(agents.map((a) => a.id), ["a1"]);
});

test("a project with no agents is not an error", async () => {
  const server = await serve((_operation, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: { boostWorkflows: null } }));
  });

  const agents = await listAgents({ automationUrl: server.url, accessToken: "t" }, "p");
  await server.close();
  assert.deepEqual(agents, []);
});

test("a bare error code is explained rather than echoed", async () => {
  // Errors::ApiError uses the code as the message when no custom text is set.
  const cases: [string, string | undefined, RegExp][] = [
    ["UNAUTHORIZED", "api_key", /api keys are not enabled for this project/i],
    ["UNAUTHORIZED", "project", /does not have permission for this project/i],
    ["FORBIDDEN", "organisation", /does not have permission for this organisation/i],
    ["NOT_FOUND", "project", /no project with that id, or your account cannot see it/i],
  ];

  for (const [code, resource, expected] of cases) {
    const server = await serve((_operation, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ errors: [{ message: code, extensions: { code, resource } }] }));
    });

    await assert.rejects(
      listProjects({ automationUrl: server.url, accessToken: "t" }),
      (error: unknown) => error instanceof GraphqlError && expected.test(error.message),
      `${code}/${resource}`
    );
    await server.close();
  }
});

test("a server that says more than the code keeps its own words", async () => {
  const server = await serve((_operation, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        errors: [
          {
            message: "this project is on a plan without api keys",
            extensions: { code: "UNAUTHORIZED", resource: "api_key" },
          },
        ],
      })
    );
  });

  await assert.rejects(
    listProjects({ automationUrl: server.url, accessToken: "t" }),
    (error: unknown) =>
      error instanceof GraphqlError &&
      /plan without api keys/.test(error.message) &&
      /not enabled for this project/i.test(error.message)
  );
  await server.close();
});

test("an error with no code is passed through untouched", async () => {
  const server = await serve((_operation, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ errors: [{ message: "something specific went wrong" }] }));
  });

  await assert.rejects(
    listProjects({ automationUrl: server.url, accessToken: "t" }),
    (error: unknown) =>
      error instanceof GraphqlError && /something specific went wrong/.test(error.message)
  );
  await server.close();
});
