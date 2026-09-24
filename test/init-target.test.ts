import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chooseInitTarget, isBroadDirectory } from "../src/install/init-target.ts";
import { isolatedTmpdir } from "./helpers.ts";

// The directory init was run in is the intent; the repository root is offered,
// never assumed. The home directory and the filesystem root are never a target,
// because a CLAUDE.md there governs every project beneath it.

test("outside any repository the folder it was run in is written to", () => {
  const dir = isolatedTmpdir();
  const out = chooseInitTarget({ cwd: dir, gitRoot: undefined, home: "/nowhere" });
  assert.deepEqual(out, { kind: "write", dir });
});

test("a home directory is refused even outside a repository", () => {
  const home = isolatedTmpdir();
  const out = chooseInitTarget({ cwd: home, gitRoot: undefined, home });
  assert.equal(out.kind, "refuse");
});

test("the repository root itself is written to without an offer", () => {
  const root = isolatedTmpdir();
  const out = chooseInitTarget({ cwd: root, gitRoot: root, home: "/nowhere" });
  assert.deepEqual(out, { kind: "write", dir: root });
});

test("a subfolder is written to, and the root is offered", () => {
  const root = isolatedTmpdir();
  const sub = join(root, "packages", "api");
  mkdirSync(sub, { recursive: true });
  const out = chooseInitTarget({ cwd: sub, gitRoot: root, home: "/nowhere" });
  assert.deepEqual(out, { kind: "write", dir: sub, repoRoot: root });
});

test("the home directory is refused even when it is the repository root", () => {
  // The reported case: `git init` in $HOME, then init from anywhere under it
  // used to drop a CLAUDE.md in $HOME that applied to every project.
  const home = isolatedTmpdir();
  const out = chooseInitTarget({ cwd: home, gitRoot: home, home });
  assert.equal(out.kind, "refuse");
  assert.match((out as { reason: string }).reason, /every project beneath it/);
});

test("a project under a home-that-is-a-repo writes in the project, not in home", () => {
  const home = isolatedTmpdir();
  const proj = join(home, "Documents", "proj");
  mkdirSync(proj, { recursive: true });
  const out = chooseInitTarget({ cwd: proj, gitRoot: home, home });
  // Offered the root, but the root is home - the caller refuses that offer.
  assert.deepEqual(out, { kind: "write", dir: proj, repoRoot: home });
  assert.equal(isBroadDirectory(home, home), true);
});

test("the filesystem root is broad", () => {
  assert.equal(isBroadDirectory("/", "/home/someone"), true);
});

test("an ordinary directory is not broad", () => {
  assert.equal(isBroadDirectory(isolatedTmpdir(), "/home/someone"), false);
});
