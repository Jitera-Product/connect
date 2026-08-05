import test from "node:test";
import assert from "node:assert/strict";

import { writeFileSync } from "node:fs";

import { readSessionStatus, statusPath, writeSessionStatus } from "../src/session-status.ts";
import { isolatedTmpdir } from "./helpers.ts";

test("a written status can be read back by session id", () => {
  const root = isolatedTmpdir();
  writeSessionStatus("session-1", { configured: true, environment: "studio-05" }, root);

  const status = readSessionStatus("session-1", root);
  assert.equal(status?.configured, true);
  assert.equal(status?.environment, "studio-05");
});

test("writes merge into the existing status instead of replacing it", () => {
  const root = isolatedTmpdir();
  writeSessionStatus("session-1", { configured: true, environment: "studio-05" }, root);
  writeSessionStatus("session-1", { recallMs: 412, recallChars: 812 }, root);

  const status = readSessionStatus("session-1", root);
  assert.equal(status?.environment, "studio-05");
  assert.equal(status?.recallMs, 412);
  assert.equal(status?.recallChars, 812);
});

test("sessions do not see each other's status", () => {
  const root = isolatedTmpdir();
  writeSessionStatus("session-1", { configured: true }, root);
  assert.equal(readSessionStatus("session-2", root), undefined);
});

test("a missing session id writes nothing and reads nothing", () => {
  const root = isolatedTmpdir();
  writeSessionStatus(undefined, { configured: true }, root);
  assert.equal(readSessionStatus(undefined, root), undefined);
});

test("a corrupt status file reads as absent", () => {
  const root = isolatedTmpdir();
  writeSessionStatus("session-1", { configured: true }, root);
  writeFileSync(statusPath("session-1", root), "{ nope", "utf8");
  assert.equal(readSessionStatus("session-1", root), undefined);
});
