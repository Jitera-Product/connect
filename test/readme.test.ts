import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

test("readme documents the environment flag for both clients", () => {
  assert.match(readme, /--config environment=studio-\d{2}/);
  assert.match(readme, /--env=studio-\d{2}/);
  assert.match(readme, /--env=studio-stage/);
});

test("readme quotes no endpoint urls, which would drift from the resolver", () => {
  assert.ok(
    !/gateway-proxy|kong-proxy-pilot|jitera-stage-pilot/.test(readme),
    "endpoints belong in the resolver, not the readme"
  );
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
