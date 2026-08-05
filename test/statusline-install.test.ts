import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { STATUS_COMMAND, installStatusLine } from "../src/install/statusline.ts";
import { isolatedTmpdir } from "./helpers.ts";

function settingsPath(home: string): string {
  return join(home, ".claude", "settings.json");
}

test("the status line is claimed when no settings file exists", () => {
  const home = isolatedTmpdir();
  const result = installStatusLine({ home });

  assert.equal(result.installed, true);
  const written = JSON.parse(readFileSync(settingsPath(home), "utf8"));
  assert.equal(written.statusLine.type, "command");
  assert.match(written.statusLine.command, /jitera-connect/);
});

test("existing settings keys survive the claim", () => {
  const home = isolatedTmpdir();
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(settingsPath(home), JSON.stringify({ theme: "dark" }), "utf8");

  installStatusLine({ home });
  const written = JSON.parse(readFileSync(settingsPath(home), "utf8"));
  assert.equal(written.theme, "dark");
  assert.equal(written.statusLine.command, STATUS_COMMAND);
});

test("someone else's status line is never clobbered", () => {
  const home = isolatedTmpdir();
  mkdirSync(join(home, ".claude"), { recursive: true });
  const foreign = { statusLine: { type: "command", command: "cognee-statusline.sh" } };
  writeFileSync(settingsPath(home), JSON.stringify(foreign), "utf8");

  const result = installStatusLine({ home });
  assert.equal(result.installed, false);
  assert.match(result.reason ?? "", /already configured/);
  const untouched = JSON.parse(readFileSync(settingsPath(home), "utf8"));
  assert.equal(untouched.statusLine.command, "cognee-statusline.sh");
});

test("claiming twice is idempotent", () => {
  const home = isolatedTmpdir();
  installStatusLine({ home });
  const first = readFileSync(settingsPath(home), "utf8");

  const again = installStatusLine({ home });
  assert.equal(again.installed, true);
  assert.equal(readFileSync(settingsPath(home), "utf8"), first);
});

test("malformed settings are reported, not overwritten", () => {
  const home = isolatedTmpdir();
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(settingsPath(home), "{ broken", "utf8");

  const result = installStatusLine({ home });
  assert.equal(result.installed, false);
  assert.match(result.reason ?? "", /not valid JSON/);
  assert.equal(readFileSync(settingsPath(home), "utf8"), "{ broken");
});

test("a dry run writes nothing", () => {
  const home = isolatedTmpdir();
  const result = installStatusLine({ home, dryRun: true });
  assert.equal(result.installed, true);
  assert.equal(existsSync(settingsPath(home)), false);
});
