import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  isExpired,
  loadCliSession,
  saveCliSession,
  sessionPath,
  transportFor,
} from "../src/cli-session.ts";
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

test("a live session is used without refreshing", async () => {
  const dir = isolatedTmpdir();
  const env = { JITERA_CONNECT_CONFIG_DIR: dir } as NodeJS.ProcessEnv;
  let refreshed = false;
  const transport = await transportFor(
    { automationUrl: "https://a", accessToken: "live", expiresAt: Date.now() + 3_600_000 },
    async () => {
      refreshed = true;
      return { accessToken: "new" };
    }
  );

  assert.equal(transport.accessToken, "live");
  assert.equal(refreshed, false, "a valid token must not be spent on a refresh");
  assert.ok(env);
});

test("an expired session is refreshed and the new token persisted", async () => {
  const dir = isolatedTmpdir();
  process.env["JITERA_CONNECT_CONFIG_DIR"] = dir;
  try {
    const transport = await transportFor(
      {
        automationUrl: "https://a",
        accessToken: "stale",
        refreshToken: "r1",
        expiresAt: Date.now() - 1000,
      },
      async () => ({ accessToken: "fresh", refreshToken: "r2", expiresInSeconds: 3600 })
    );

    assert.equal(transport.accessToken, "fresh");
    const saved = loadCliSession({ JITERA_CONNECT_CONFIG_DIR: dir } as NodeJS.ProcessEnv);
    assert.equal(saved?.accessToken, "fresh");
    assert.equal(saved?.refreshToken, "r2");
  } finally {
    delete process.env["JITERA_CONNECT_CONFIG_DIR"];
  }
});

test("the refreshed session file stays private", async () => {
  const dir = isolatedTmpdir();
  process.env["JITERA_CONNECT_CONFIG_DIR"] = dir;
  try {
    await transportFor(
      { automationUrl: "https://a", accessToken: "stale", refreshToken: "r1", expiresAt: 0 },
      async () => ({ accessToken: "fresh" })
    );
    const mode = statSync(join(dir, "session.json")).mode & 0o777;
    assert.equal(mode, 0o600, "a refresh must not widen the token file");
  } finally {
    delete process.env["JITERA_CONNECT_CONFIG_DIR"];
  }
});

test("an expired session with no refresh token says to sign in again", async () => {
  await assert.rejects(
    transportFor({ automationUrl: "https://a", accessToken: "stale", expiresAt: 0 }, async () => {
      throw new Error("must not be called");
    }),
    /Run login again/
  );
});
