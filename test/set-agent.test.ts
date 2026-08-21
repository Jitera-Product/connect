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

test("--agent records a selection without prompting", async () => {
  const { root, nested } = boundRepo();
  const { code } = await runNode(CONNECT, {
    args: ["set-agent", "--agent=a1", "--agent=a2"],
    cwd: nested,
    env: OFFLINE,
  });

  assert.equal(code, 0);
  // Written at the repository root, from a nested directory.
  assert.deepEqual(markerIn(root)["agents"], ["a1", "a2"]);
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
    args: ["set-agent", "--agent=a1", "--dry-run"],
    cwd: root,
    env: OFFLINE,
  });

  assert.equal(code, 0);
  assert.match(stdout, /would record/);
  assert.ok(!("agents" in markerIn(root)), "a dry run must not touch the file");
});

test("without a stored sign-in the user is told how to proceed", async () => {
  const { root } = boundRepo();
  const { code, stderr } = await runNode(CONNECT, { args: ["set-agent"], cwd: root, env: OFFLINE });

  assert.notEqual(code, 0);
  assert.match(stderr, /login/);
  assert.match(stderr, /--agent=/, "the non-interactive escape hatch is named");
});

test("the selection preserves the rest of the marker", async () => {
  const { root } = boundRepo({ environment: "studio-06", project: "p1" });
  await runNode(CONNECT, { args: ["set-agent", "--agent=a1"], cwd: root, env: OFFLINE });

  const marker = markerIn(root);
  assert.equal(marker["environment"], "studio-06");
  assert.equal(marker["project"], "p1");
});
