import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ENVIRONMENT,
  UnknownEnvironmentError,
  parseEnvironment,
  resolveStudioUrl,
} from "../src/environments.ts";
import { readJsonFile, type PluginManifest } from "../src/manifest.ts";
import { ROOT } from "./helpers.ts";
import { join } from "node:path";

test("no environment means production", () => {
  for (const value of [undefined, null, ""]) {
    assert.deepEqual(parseEnvironment(value), { kind: "production" });
  }
});

test("studio and production are both production", () => {
  assert.deepEqual(parseEnvironment("studio"), { kind: "production" });
  assert.deepEqual(parseEnvironment("production"), { kind: "production" });
});

test("studio-stage is staging", () => {
  assert.deepEqual(parseEnvironment("studio-stage"), { kind: "stage" });
});

test("numbered pilots carry a zero padded instance", () => {
  assert.deepEqual(parseEnvironment("studio-06"), { kind: "pilot", instance: "06" });
  assert.deepEqual(parseEnvironment("studio-6"), { kind: "pilot", instance: "06" });
  assert.deepEqual(parseEnvironment("studio-12"), { kind: "pilot", instance: "12" });
});

test("environment names are case insensitive and trimmed", () => {
  assert.deepEqual(parseEnvironment("  STUDIO-06 "), { kind: "pilot", instance: "06" });
});

test("an unknown environment fails with a message naming what is supported", () => {
  assert.throws(
    () => parseEnvironment("studio-banana"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownEnvironmentError);
      assert.match(error.message, /studio-banana/);
      assert.match(error.message, /studio-stage/);
      assert.match(error.message, /studio-06/);
      return true;
    }
  );
});

test("a bare pilot number is rejected rather than guessed at", () => {
  assert.throws(() => parseEnvironment("06"), UnknownEnvironmentError);
});

test("studio urls follow the deployment naming", () => {
  assert.equal(resolveStudioUrl(), "https://studio.jitera.app");
  assert.equal(resolveStudioUrl("studio-stage"), "https://studio-stage.pilot.jitera.app");
  assert.equal(resolveStudioUrl("studio-04"), "https://studio-04.pilot.jitera.app");
  assert.equal(resolveStudioUrl("studio-4"), "https://studio-04.pilot.jitera.app");
});

test("the package hardcodes studio hosts only, never gateway topology", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(join(ROOT, "src", "environments.ts"), "utf8");
  for (const internal of ["kong-proxy", "gateway-proxy", "jitera-stage-pilot"]) {
    assert.ok(!source.includes(internal), `${internal} must come from studio, not be hardcoded`);
  }
});

test("the plugin manifest defaults to the production environment name", () => {
  const manifest = readJsonFile<PluginManifest>(join(ROOT, ".claude-plugin", "plugin.json"));
  assert.equal(manifest.userConfig?.["environment"]?.default, DEFAULT_ENVIRONMENT);
});
