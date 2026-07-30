import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMcpUrl } from "../src/environments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

test("readme npx commands use the published package name", () => {
  const invocations = readme.match(/npx \S+/g) ?? [];
  assert.ok(invocations.length > 0, "readme must document the npx entry point");
  for (const invocation of invocations) {
    assert.equal(invocation, `npx ${pkg.name}`, `${invocation} is not the published package`);
  }
});

test("readme documents the production endpoint the resolver produces", () => {
  assert.ok(readme.includes(resolveMcpUrl()));
});

test("readme documents the stage endpoint the resolver produces", () => {
  assert.ok(readme.includes(resolveMcpUrl("studio-stage")));
});

test("readme pilot endpoint pattern matches the resolver", () => {
  const documented = readme.match(
    /https:\/\/\S+\/gateway\/boost-(\d{2})\/mcp/
  );
  assert.ok(documented, "readme must show a concrete pilot endpoint");
  assert.equal(documented[0], resolveMcpUrl(`studio-${documented[1]}`));
});

test("readme marketplace commands point at the real repository", () => {
  const repo = pkg.repository.url.replace(/^git\+https:\/\/github\.com\//, "").replace(/\.git$/, "");
  const [owner, name] = repo.split("/");
  for (const line of readme.split("\n")) {
    if (line.includes("marketplace add")) {
      assert.match(line.toLowerCase(), new RegExp(`${owner.toLowerCase()}/${name.toLowerCase()}`));
    }
  }
});
