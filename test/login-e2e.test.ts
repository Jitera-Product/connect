import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { runNode } from "./helpers.ts";

const LOGIN = "dist/bin/login.js";

const DEVICE_AUTHORIZATION = {
  device_code: "9GV07evXz54lNruDderAeiPZcwOkmbg6fHGjR2ULVuc",
  user_code: "FQMOQ3EF",
  verification_uri: "http://localhost:3000/oauth/device",
  verification_uri_complete: "http://localhost:3000/oauth/device?user_code=FQMOQ3EF",
  expires_in: 300,
  interval: 0,
};

const ACCESS_TOKEN = {
  access_token: "eyJhbGciOiJIUzUxMiJ9.stub",
  token_type: "Bearer",
  expires_in: 86_400,
  refresh_token: "zFdeuLhb4KtzalWDvN",
  created_at: 1_785_450_400,
  resource_owner: "User",
  resource_id: 1,
};

interface Replay {
  readonly url: string;
  readonly close: () => Promise<void>;
  readonly seen: string[];
}

interface ReplayOptions {
  readonly pendingPolls?: number;
  readonly projects?: { uuid: string; name: string; canManageApiKey?: boolean }[];
  readonly teams?: { slug: string; name: string; type: string }[];
  readonly createKeyResponse?: unknown;
  // When set, a params object WITHOUT projectUuid gets this response — the
  // new-backend, user-level key path. Unset models today's deployments, which
  // reject a projectless create.
  readonly userKeyResponse?: unknown;
}

function replayServer(options: ReplayOptions = {}): Promise<Replay> {
  const {
    pendingPolls = 1,
    projects = [{ uuid: "proj-uuid-1", name: "Acme Platform", canManageApiKey: true }],
    teams = [],
    createKeyResponse = {
      data: {
        createApiKey: { rawKey: "sk-jitera-abc123", errors: null, apiKey: { maskedKey: "sk-…123" } },
      },
    },
  } = options;

  let polls = 0;
  const seen: string[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      seen.push(`${req.method} ${req.url}`);
      const json = (status: number, body: unknown): void => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      if (req.url === "/oauth/authorize_device") return json(200, DEVICE_AUTHORIZATION);

      if (req.url === "/oauth/token") {
        polls += 1;
        if (polls <= pendingPolls) {
          return json(400, {
            error: "authorization_pending",
            error_description:
              "The authorization request is still pending as the end-user hasn't yet completed the user interaction steps",
          });
        }
        return json(200, ACCESS_TOKEN);
      }

      if (req.url === "/graphql") {
        const body = JSON.parse(raw) as {
          operationName?: string;
          variables?: { params?: { projectUuid?: string } };
        };
        seen.push(`gql ${body.operationName}`);
        if (body.operationName === "ConnectTeams") return json(200, { data: { teams } });
        if (body.operationName === "ConnectProjects")
          return json(200, { data: { projects: { projects, errors: null } } });
        if (body.operationName === "ConnectCreateApiKey") {
          seen.push(`createApiKey ${JSON.stringify(body.variables)}`);
          if (!body.variables?.params?.projectUuid) {
            if (options.userKeyResponse !== undefined) return json(200, options.userKeyResponse);
            return json(200, { errors: [{ message: "api_key: invalid input" }] });
          }
          return json(200, createKeyResponse);
        }
        return json(200, { errors: [{ message: `unexpected operation ${body.operationName}` }] });
      }

      json(404, { error: "not_found" });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        seen,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test("a deployment with user-level keys needs no project at all", async () => {
  const server = await replayServer({
    userKeyResponse: {
      data: {
        createApiKey: { rawKey: "sk-user-key-1", errors: null, apiKey: { maskedKey: "sk-…er1" } },
      },
    },
  });
  const { stdout, code } = await runNode(LOGIN, {
    args: ["--json"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });

  assert.equal(code, 0, `login exited ${code}: ${stdout}`);
  const result = JSON.parse(stdout.slice(stdout.indexOf("{"))) as {
    apiKey: string;
    scope: string;
    projectUuid: string | null;
  };
  assert.equal(result.apiKey, "sk-user-key-1");
  assert.equal(result.scope, "user");
  assert.equal(result.projectUuid, null);
  assert.ok(!server.seen.includes("gql ConnectProjects"), "no project listing for a user key");
  assert.ok(!server.seen.includes("gql ConnectTeams"), "no organisation lookup for a user key");
  await server.close();
});

test("a user-level login points at init for repo binding", async () => {
  const server = await replayServer({
    userKeyResponse: {
      data: { createApiKey: { rawKey: "sk-user-key-2", errors: null, apiKey: null } },
    },
  });
  const { stdout } = await runNode(LOGIN, { env: { JITERA_AUTOMATION_URL: server.url } });
  assert.match(stdout, /user-level/);
  assert.match(stdout, /init/);
  await server.close();
});

test("older deployments fall back to the project flow with a notice", async () => {
  const server = await replayServer();
  const { stdout, code } = await runNode(LOGIN, {
    args: ["--json"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });

  assert.equal(code, 0, `login exited ${code}: ${stdout}`);
  assert.match(stdout, /project keys only/);
  const result = JSON.parse(stdout.slice(stdout.indexOf("{"))) as { scope: string };
  assert.equal(result.scope, "project");
  assert.ok(server.seen.includes("gql ConnectProjects"), "fallback must list projects");
  await server.close();
});

test("an explicit --project skips the user-level attempt entirely", async () => {
  const server = await replayServer();
  await runNode(LOGIN, {
    args: ["--json", "--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  const creates = server.seen.filter((s) => s.startsWith("createApiKey"));
  assert.equal(creates.length, 1);
  assert.ok(creates[0]?.includes("proj-uuid-1"));
  await server.close();
});

test("login walks the whole flow and prints an api key", async () => {
  const server = await replayServer();
  const { stdout, code } = await runNode(LOGIN, {
    args: ["--json", "--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });

  assert.equal(code, 0, `login exited ${code}: ${stdout}`);
  const result = JSON.parse(stdout.slice(stdout.indexOf("{"))) as {
    apiKey: string;
    mcpAccess: string;
  };
  assert.equal(result.apiKey, "sk-jitera-abc123");
  assert.equal(result.mcpAccess, "read_write");

  assert.ok(server.seen.includes("POST /oauth/authorize_device"));
  assert.ok(server.seen.filter((s) => s === "POST /oauth/token").length >= 2, "must poll");
  await server.close();
});

test("login shows the code and url for the user to approve", async () => {
  const server = await replayServer();
  const { stdout } = await runNode(LOGIN, {
    args: ["--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  assert.match(stdout, /FQMOQ3EF/);
  assert.match(stdout, /oauth\/device\?user_code=FQMOQ3EF/);
  assert.match(stdout, /export JITERA_API_KEY=sk-jitera-abc123/);
  await server.close();
});

test("a single project is selected without prompting", async () => {
  const server = await replayServer();
  const { stdout, code } = await runNode(LOGIN, {
    args: ["--json"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  assert.equal(code, 0);
  assert.match(stdout, /proj-uuid-1/);
  await server.close();
});

test("read-only is requested when asked for", async () => {
  const server = await replayServer();
  await runNode(LOGIN, {
    args: ["--json", "--read-only", "--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  const call = server.seen.find((s) => s.startsWith("createApiKey"));
  assert.ok(call?.includes('"mcpAccess":"read"'), `sent: ${call}`);
  await server.close();
});

test("an account with no projects fails with a clear reason", async () => {
  const server = await replayServer({ projects: [] });
  const { stderr, code } = await runNode(LOGIN, { env: { JITERA_AUTOMATION_URL: server.url } });
  assert.equal(code, 1);
  assert.match(stderr, /no projects/);
  await server.close();
});

test("a permission failure surfaces the server's own message", async () => {
  const server = await replayServer({
    createKeyResponse: { errors: [{ message: "You are not authorized to manage api keys" }] },
  });
  const { stderr, code } = await runNode(LOGIN, {
    args: ["--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  assert.equal(code, 1);
  assert.match(stderr, /not authorized to manage api keys/);
  await server.close();
});

test("a string error from the real server is surfaced, not crashed on", async () => {
  const server = await replayServer({
    createKeyResponse: {
      data: { createApiKey: { success: false, errors: "not allowed to manage_api_key? this Project" } },
    },
  });
  const { stdout, stderr, code } = await runNode(LOGIN, {
    args: ["--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  assert.equal(code, 1);
  assert.match(stderr, /not allowed to manage_api_key/);
  assert.ok(!stderr.includes("is not a function"), "must not crash on a non-array errors field");
  assert.ok(!stdout.includes("export JITERA_API_KEY="));
  await server.close();
});

test("success false with no message still fails rather than printing nothing", async () => {
  const server = await replayServer({
    createKeyResponse: { data: { createApiKey: { success: false, errors: null } } },
  });
  const { stderr, code } = await runNode(LOGIN, {
    args: ["--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  assert.equal(code, 1);
  assert.match(stderr, /unsuccessful|no key was returned/);
  await server.close();
});

test("a mutation that returns no key does not print an empty export line", async () => {
  const server = await replayServer({
    createKeyResponse: { data: { createApiKey: { rawKey: null, errors: null, apiKey: null } } },
  });
  const { stdout, stderr, code } = await runNode(LOGIN, {
    args: ["--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  assert.equal(code, 1);
  assert.ok(!stdout.includes("export JITERA_API_KEY="));
  assert.match(stderr, /no key was returned/);
  await server.close();
});

test("projects you cannot create a key on are excluded, with a reason", async () => {
  const server = await replayServer({
    projects: [{ uuid: "proj-uuid-1", name: "Acme Platform", canManageApiKey: false }],
  });
  const { stderr, code } = await runNode(LOGIN, { env: { JITERA_AUTOMATION_URL: server.url } });

  assert.equal(code, 1);
  assert.match(stderr, /allow you to create an API key/);
  assert.ok(!stderr.includes("no projects to connect to"), "the account does have projects");
  await server.close();
});

test("a single organisation is selected without prompting", async () => {
  const server = await replayServer({
    teams: [{ slug: "acme", name: "Acme", type: "company" }],
  });
  const { stdout, code } = await runNode(LOGIN, {
    args: ["--json"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });

  assert.equal(code, 0, `login exited ${code}: ${stdout}`);
  assert.match(stdout, /Organisation {2}Acme/);
  await server.close();
});

test("--org picks the organisation so nothing is prompted", async () => {
  const server = await replayServer({
    teams: [
      { slug: "acme", name: "Acme", type: "company" },
      { slug: "mine", name: "My Team", type: "personal" },
    ],
  });
  const { stdout, code } = await runNode(LOGIN, {
    args: ["--json", "--org=acme"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });

  assert.equal(code, 0, `login exited ${code}: ${stdout}`);
  assert.match(stdout, /proj-uuid-1/);
  await server.close();
});

test("an unknown --org fails and lists the ones that exist", async () => {
  const server = await replayServer({
    teams: [{ slug: "acme", name: "Acme", type: "company" }],
  });
  const { stderr, code } = await runNode(LOGIN, {
    args: ["--org=nope"],
    env: { JITERA_AUTOMATION_URL: server.url },
  });

  assert.equal(code, 1);
  assert.match(stderr, /no organisation with slug "nope"/);
  assert.match(stderr, /acme/);
  await server.close();
});

test("piped output never fills up with spinner frames", async () => {
  const server = await replayServer();
  const { stdout } = await runNode(LOGIN, {
    args: ["--project=proj-uuid-1"],
    env: { JITERA_AUTOMATION_URL: server.url, FORCE_COLOR: "1", COLORTERM: "truecolor" },
  });

  assert.ok(!/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(stdout), "a redirected stream must not animate");
  assert.ok(!stdout.includes("\r"), "no carriage returns when not a terminal");
  assert.match(stdout, /Waiting for approval/);
  await server.close();
});

test("the printed key is labelled as a secret shown once", async () => {
  // It reaches shell history, CI logs and screen recordings, and grants
  // account-wide read + write until it is revoked.
  const server = await replayServer({
    userKeyResponse: {
      data: {
        createApiKey: { rawKey: "sk-user-key-1", errors: null, apiKey: { maskedKey: "sk-…er1" } },
      },
    },
  });
  const { stdout, code } = await runNode(LOGIN, {
    env: { JITERA_AUTOMATION_URL: server.url },
  });
  await server.close();

  assert.equal(code, 0, stdout);
  assert.match(stdout, /secret/i);
  assert.match(stdout, /shown once/i);
  assert.match(stdout, /revoke/i);
  assert.match(stdout, /account-wide read \+ write/i);
  assert.match(stdout, /sk-user-key-1/, "the key itself is still available to copy");
});

test("a disabled api-keys feature explains itself instead of printing UNAUTHORIZED", async () => {
  // check_feature_access raises ApiError(UNAUTHORIZED, resource: 'api_key'), whose
  // message is the bare code. Accounts without the flag - unlimited-credit ones
  // during rollout - hit this on the ordinary login path, so it has to read as
  // something a user can act on.
  const server = await replayServer({
    userKeyResponse: {
      errors: [{ message: "UNAUTHORIZED", extensions: { code: "UNAUTHORIZED", resource: "api_key" } }],
    },
    createKeyResponse: {
      errors: [{ message: "UNAUTHORIZED", extensions: { code: "UNAUTHORIZED", resource: "api_key" } }],
    },
  });
  const { stderr, code } = await runNode(LOGIN, { env: { JITERA_AUTOMATION_URL: server.url } });
  await server.close();

  assert.notEqual(code, 0);
  assert.match(stderr, /api keys are not enabled/i);
  assert.ok(!/^\s*UNAUTHORIZED\s*$/m.test(stderr), "the bare code is not an explanation");
});
