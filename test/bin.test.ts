import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT, runNode } from "./helpers.ts";

interface PackageJson {
  readonly name: string;
  readonly bin: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as PackageJson;

test("a bin matches the unscoped package name so npx can resolve it", () => {
  const unscoped = pkg.name.replace(/^@[^/]+\//, "");
  assert.ok(
    Object.keys(pkg.bin).includes(unscoped),
    `npx @jitera/connect looks for a bin named "${unscoped}"; found ${Object.keys(pkg.bin).join(", ")}`
  );
});

test("every declared bin points at the same dispatching entry point", () => {
  const targets = new Set(Object.values(pkg.bin));
  assert.equal(targets.size, 1, "multiple distinct bins make npx ambiguous");
});

test("the entry point exists in the built output", () => {
  const target = Object.values(pkg.bin)[0] ?? "";
  assert.ok(readFileSync(join(ROOT, target), "utf8").length > 0);
});

test("the bare command shows the installer usage", async () => {
  const { stdout, code } = await runNode("dist/bin/connect.js", { args: ["--help"] });
  assert.equal(code, 0);
  assert.match(stdout, /usage: npx @jitera\/connect \[/);
  assert.match(stdout, /--skip-skills/);
});

test("the login subcommand shows the login usage", async () => {
  const { stdout, code } = await runNode("dist/bin/connect.js", { args: ["login", "--help"] });
  assert.equal(code, 0);
  assert.match(stdout, /usage: npx @jitera\/connect login/);
  assert.match(stdout, /--install/);
});

test("login flags are not mistaken for installer flags", async () => {
  const { stdout } = await runNode("dist/bin/connect.js", { args: ["login", "--help"] });
  assert.ok(!stdout.includes("--skip-skills"), "login must not show installer-only flags");
});
