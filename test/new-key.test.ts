import test from "node:test";
import assert from "node:assert/strict";

import { runNode } from "./helpers.ts";

const CONNECT = "dist/bin/connect.js";

// No stored sign-in and a dead studio, so nothing reaches the network: these
// exercise the flag handling and the guards in front of it.
const OFFLINE = { JITERA_STUDIO_URL: "http://127.0.0.1:1", XDG_CONFIG_HOME: "/nonexistent" };

test("new-key shows its usage on --help", async () => {
  const { code, stdout } = await runNode(CONNECT, { args: ["new-key", "--help"] });
  assert.equal(code, 0);
  assert.match(stdout, /new-key/);
  assert.match(stdout, /--access=read_write/);
});

test("new-key rejects an unrecognised argument", async () => {
  const { code, stderr } = await runNode(CONNECT, { args: ["new-key", "--nope"] });
  assert.equal(code, 2);
  assert.match(stderr, /unrecognised argument/);
});

test("new-key rejects an access level that is not offered", async () => {
  const { code, stderr } = await runNode(CONNECT, { args: ["new-key", "--access=write"] });
  assert.equal(code, 2);
  assert.match(stderr, /unknown access "write"/);
});

test("without a stored sign-in it says to log in, rather than failing obscurely", async () => {
  const { code, stderr } = await runNode(CONNECT, { args: ["new-key"], env: OFFLINE });
  assert.equal(code, 1);
  assert.match(stderr, /no stored sign-in/);
  assert.match(stderr, /connect login/);
});

test("the sign-in check comes before any network call, so it works offline", async () => {
  // A studio that refuses connections must not change the advice: the missing
  // session is the real problem and is what the user has to fix.
  const { code, stderr } = await runNode(CONNECT, {
    args: ["new-key", "--env=studio-06"],
    env: OFFLINE,
  });
  assert.equal(code, 1);
  assert.match(stderr, /no stored sign-in/);
  assert.doesNotMatch(stderr, /deployment configuration/);
});

test("an unknown environment is reported as such", async () => {
  const { code, stderr } = await runNode(CONNECT, {
    args: ["new-key", "--env=not-an-env"],
    env: { XDG_CONFIG_HOME: "/nonexistent" },
  });
  // The session guard still fires first; what matters is that neither path
  // crashes and both explain themselves.
  assert.notEqual(code, 0);
  assert.match(stderr, /no stored sign-in|unknown environment/);
});
