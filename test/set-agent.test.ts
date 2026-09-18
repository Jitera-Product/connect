import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isolatedTmpdir, runNode } from "./helpers.ts";

const CONNECT = "dist/bin/connect.js";

// No stored sign-in and a dead studio: the listing path is never reached, so
// these exercise the flag paths and the guards around them.
const OFFLINE = { JITERA_STUDIO_URL: "http://127.0.0.1:1", XDG_CONFIG_HOME: "/nonexistent" };

function boundRepo(marker: Record<string, unknown> = { environment: "studio", project: "p1" }) {
  const root = isolatedTmpdir();
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);
  writeFileSync(join(root, ".jitera.json"), JSON.stringify(marker), "utf8");
  const nested = join(root, "src", "deep");
  mkdirSync(nested, { recursive: true });
  return { root, nested };
}

const markerIn = (root: string) =>
  JSON.parse(readFileSync(join(root, ".jitera.json"), "utf8")) as Record<string, unknown>;

test("set-agent shows its usage on --help", async () => {
  const { code, stdout } = await runNode(CONNECT, { args: ["set-agent", "--help"] });
  assert.equal(code, 0);
  assert.match(stdout, /set-agent/);
  assert.match(stdout, /space selects, enter saves/);
});

test("set-agent rejects an unrecognised argument", async () => {
  const { code, stderr } = await runNode(CONNECT, { args: ["set-agent", "--nope"] });
  assert.equal(code, 2);
  assert.match(stderr, /unrecognised argument/);
});

test("set-agent refuses to run outside a git repository", async () => {
  const { code, stderr } = await runNode(CONNECT, {
    args: ["set-agent"],
    cwd: isolatedTmpdir(),
    env: OFFLINE,
  });
  assert.equal(code, 2);
  assert.match(stderr, /not a git repository/);
});

test("an unbound repository is told to run init first", async () => {
  const root = isolatedTmpdir();
  assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: root }).status, 0);

  const { code, stderr } = await runNode(CONNECT, { args: ["set-agent"], cwd: root, env: OFFLINE });
  assert.notEqual(code, 0);
  assert.match(stderr, /not bound to a project/);
  assert.match(stderr, /connect init/);
});

test("a marker with no project says so rather than listing nothing", async () => {
  const { root } = boundRepo({ environment: "studio" });
  const { code, stderr } = await runNode(CONNECT, { args: ["set-agent"], cwd: root, env: OFFLINE });
  assert.notEqual(code, 0);
  assert.match(stderr, /records no project/);
});

test("--agent is no longer accepted", async () => {
  const { root } = boundRepo();
  const { code, stderr } = await runNode(CONNECT, {
    args: ["set-agent", "--agent=a1"],
    cwd: root,
    env: OFFLINE,
  });
  assert.equal(code, 2);
  assert.match(stderr, /unrecognised argument/);
});

test("--all clears a previous selection", async () => {
  const { root } = boundRepo({ environment: "studio", project: "p1", agents: ["a1"] });
  const { code, stdout } = await runNode(CONNECT, {
    args: ["set-agent", "--all"],
    cwd: root,
    env: OFFLINE,
  });

  assert.equal(code, 0);
  assert.match(stdout, /every agent/);
  assert.ok(!("agents" in markerIn(root)), "the key is removed, not left empty");
});

test("--dry-run reports without writing", async () => {
  const { root } = boundRepo();
  const { code, stdout } = await runNode(CONNECT, {
    args: ["set-agent", "--all", "--dry-run"],
    cwd: root,
    env: OFFLINE,
  });

  assert.equal(code, 0);
  assert.match(stdout, /would record/);
});

test("an empty list does not claim the project has no agents", async () => {
  // policy_scope returns an empty list for a project the account cannot see,
  // so the message must not assert the project is empty.
  const { root } = boundRepo();
  const server = await import("node:http").then(({ createServer }) => {
    const s = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: { boostWorkflows: [] } }));
    });
    return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
      s.listen(0, "127.0.0.1", () => {
        const address = s.address();
        const port = typeof address === "object" && address !== null ? address.port : 0;
        resolve({
          url: `http://127.0.0.1:${port}`,
          close: () => new Promise<void>((done) => s.close(() => done())),
        });
      });
    });
  });

  const configDir = isolatedTmpdir();
  writeFileSync(
    join(configDir, "session.json"),
    JSON.stringify({ automationUrl: server.url, accessToken: "t", expiresAt: Date.now() + 3_600_000 }),
    "utf8"
  );

  const { code, stderr } = await runNode(CONNECT, {
    args: ["set-agent"],
    cwd: root,
    env: { JITERA_CONNECT_CONFIG_DIR: configDir, JITERA_STUDIO_URL: "http://127.0.0.1:1" },
  });
  await server.close();

  assert.notEqual(code, 0);
  assert.match(stderr, /cannot see them/, "a permission cause is named too");
});


test("without a stored sign-in the user is told how to proceed", async () => {
  const { root } = boundRepo();
  const { code, stderr } = await runNode(CONNECT, { args: ["set-agent"], cwd: root, env: OFFLINE });

  assert.notEqual(code, 0);
  assert.match(stderr, /login/);
});

test("--all preserves the rest of the marker", async () => {
  const { root } = boundRepo({ environment: "studio-06", project: "p1" });
  await runNode(CONNECT, { args: ["set-agent", "--all"], cwd: root, env: OFFLINE });

  const marker = markerIn(root);
  assert.equal(marker["environment"], "studio-06");
  assert.equal(marker["project"], "p1");
});

test("an unwritable marker reports the reason instead of a stack trace", async () => {
  const { root } = boundRepo();
  const { chmodSync } = await import("node:fs");
  chmodSync(join(root, ".jitera.json"), 0o444);

  const { code, stderr } = await runNode(CONNECT, {
    args: ["set-agent", "--all"],
    cwd: root,
    env: OFFLINE,
  });
  chmodSync(join(root, ".jitera.json"), 0o644);

  assert.notEqual(code, 0);
  assert.match(stderr, /could not write \.jitera\.json/);
  assert.ok(!/at .*writeFileSync/.test(stderr), "no stack trace");
});


test("a binding in a subfolder is found from beneath it", async () => {
  // init writes the binding where it is run, which may be a subfolder of the
  // repository; set-agent must follow it there rather than read the git root.
  const { root } = boundRepo();
  const sub = join(root, "packages", "api");
  mkdirSync(join(sub, "src"), { recursive: true });
  writeFileSync(join(sub, ".jitera.json"), JSON.stringify({ environment: "studio", project: "p-sub" }), "utf8");

  const { code } = await runNode(CONNECT, {
    args: ["set-agent", "--all"],
    cwd: join(sub, "src"),
    env: OFFLINE,
  });
  assert.equal(code, 0);
  assert.ok(!("agents" in markerIn(sub)), "--all clears the selection");
  assert.equal(markerIn(root)["agents"], undefined, "the root binding is untouched");
});
