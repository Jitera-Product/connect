import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, writeFileSync } from "node:fs";

import { isExpired, loadCliSession, saveCliSession, sessionPath } from "../src/cli-session.ts";
import { isolatedTmpdir } from "./helpers.ts";

function env(): NodeJS.ProcessEnv {
  return { JITERA_CONNECT_CONFIG_DIR: isolatedTmpdir() };
}

const SESSION = {
  automationUrl: "https://automation.example.test",
  environment: "studio-05",
  accessToken: "at-1",
  refreshToken: "rt-1",
  expiresAt: 1_900_000_000_000,
};

test("a saved session round-trips", () => {
  const e = env();
  saveCliSession(SESSION, e);
  assert.deepEqual(loadCliSession(e), SESSION);
});

test("the session file is private to the user", () => {
  const e = env();
  saveCliSession(SESSION, e);
  const mode = statSync(sessionPath(e)).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600, got 0${mode.toString(8)}`);
});

test("saving again tightens permissions even if the file existed", () => {
  const e = env();
  saveCliSession(SESSION, e);
  const path = sessionPath(e);
  writeFileSync(path, readFileSync(path, "utf8"), { mode: 0o644 });
  saveCliSession({ ...SESSION, accessToken: "at-2" }, e);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(loadCliSession(e)?.accessToken, "at-2");
});

test("a corrupt session reads as absent", () => {
  const e = env();
  saveCliSession(SESSION, e);
  writeFileSync(sessionPath(e), "{ nope", "utf8");
  assert.equal(loadCliSession(e), undefined);
});

test("a missing session reads as absent", () => {
  assert.equal(loadCliSession(env()), undefined);
});

test("expiry honours the safety margin", () => {
  assert.equal(isExpired(SESSION, SESSION.expiresAt - 120_000), false);
  assert.equal(isExpired(SESSION, SESSION.expiresAt - 30_000), true);
  assert.equal(isExpired(SESSION, SESSION.expiresAt + 1), true);
});

test("a session without expiry never counts as expired", () => {
  const { expiresAt: _dropped, ...rest } = SESSION;
  assert.equal(isExpired(rest, Number.MAX_SAFE_INTEGER), false);
});
