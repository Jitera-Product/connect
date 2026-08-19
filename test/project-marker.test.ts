import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  MARKER_FILENAME,
  readProjectMarker,
  writeProjectMarker,
} from "../src/project-marker.ts";
import { isolatedTmpdir } from "./helpers.ts";

test("write creates a pretty-printed marker with a trailing newline", () => {
  const root = isolatedTmpdir();
  const { path, changed } = writeProjectMarker(root, {
    environment: "studio-05",
    project: "abc-123",
  });

  assert.equal(changed, true);
  assert.equal(path, join(root, MARKER_FILENAME));
  const raw = readFileSync(path, "utf8");
  assert.ok(raw.endsWith("\n"));
  assert.deepEqual(JSON.parse(raw), { environment: "studio-05", project: "abc-123" });
});

test("write preserves keys it does not manage", () => {
  const root = isolatedTmpdir();
  writeFileSync(
    join(root, MARKER_FILENAME),
    JSON.stringify({ environment: "studio", notes: "keep me" }),
    "utf8"
  );

  writeProjectMarker(root, { environment: "studio-05" });
  const parsed = JSON.parse(readFileSync(join(root, MARKER_FILENAME), "utf8"));
  assert.equal(parsed.environment, "studio-05");
  assert.equal(parsed.notes, "keep me");
});

test("writing the same marker twice reports no change", () => {
  const root = isolatedTmpdir();
  assert.equal(writeProjectMarker(root, { environment: "studio" }).changed, true);
  assert.equal(writeProjectMarker(root, { environment: "studio" }).changed, false);
});

test("a dry run reports the change without writing", () => {
  const root = isolatedTmpdir();
  const { changed } = writeProjectMarker(root, { environment: "studio" }, true);
  assert.equal(changed, true);
  assert.equal(existsSync(join(root, MARKER_FILENAME)), false);
});

test("read finds the marker from a nested directory", () => {
  const root = isolatedTmpdir();
  writeProjectMarker(root, { environment: "studio-04" });
  const nested = join(root, "src", "deep");
  mkdirSync(nested, { recursive: true });

  const marker = readProjectMarker(nested);
  assert.equal(marker?.environment, "studio-04");
});

test("read returns nothing when no marker exists", () => {
  assert.equal(readProjectMarker(isolatedTmpdir()), undefined);
});

test("read survives a malformed marker", () => {
  const root = isolatedTmpdir();
  writeFileSync(join(root, MARKER_FILENAME), "{ not json", "utf8");
  assert.equal(readProjectMarker(root), undefined);
});

test("read ignores non-string fields", () => {
  const root = isolatedTmpdir();
  writeFileSync(join(root, MARKER_FILENAME), JSON.stringify({ environment: 42 }), "utf8");
  assert.equal(readProjectMarker(root)?.environment, undefined);
});

test("a marker of null does not throw on the way out", () => {
  // `null` parses cleanly and then throws on property access. A hook must
  // never break a session over a file it merely read.
  const dir = isolatedTmpdir();
  writeFileSync(join(dir, ".jitera.json"), "null", "utf8");
  assert.equal(readProjectMarker(dir), undefined);
});

test("a marker that is not an object reads as unbound", () => {
  for (const body of ['"a string"', "[]", "123", "true"]) {
    const dir = isolatedTmpdir();
    writeFileSync(join(dir, ".jitera.json"), body, "utf8");
    assert.equal(readProjectMarker(dir), undefined, `${body} is not a marker`);
  }
});

test("the search stops at the repository root", () => {
  // A stray marker in a parent directory must not bind unrelated repos.
  const parent = isolatedTmpdir();
  writeFileSync(join(parent, ".jitera.json"), JSON.stringify({ project: "parent" }), "utf8");
  const repo = join(parent, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  const nested = join(repo, "src", "deep");
  mkdirSync(nested, { recursive: true });

  assert.equal(readProjectMarker(nested), undefined);
});

test("a repository's own marker still wins from a nested directory", () => {
  const parent = isolatedTmpdir();
  const repo = join(parent, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  writeFileSync(join(repo, ".jitera.json"), JSON.stringify({ project: "own" }), "utf8");
  const nested = join(repo, "src", "deep");
  mkdirSync(nested, { recursive: true });

  assert.equal(readProjectMarker(nested)?.project, "own");
});

test("directories that are not repositories still inherit from above", () => {
  // A monorepo package without its own .git keeps reading the root marker.
  const root = isolatedTmpdir();
  writeFileSync(join(root, ".jitera.json"), JSON.stringify({ project: "monorepo" }), "utf8");
  const pkg = join(root, "packages", "web");
  mkdirSync(pkg, { recursive: true });

  assert.equal(readProjectMarker(pkg)?.project, "monorepo");
});
