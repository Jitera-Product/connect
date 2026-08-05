import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { isolatedTmpdir, runNode } from "./helpers.ts";

const CONNECT = "dist/bin/connect.js";

// Points discovery at a dead port so init falls back to the default brand
// instantly instead of reaching the real studio.
const OFFLINE = { JITERA_STUDIO_URL: "http://127.0.0.1:1" };

function gitRepo(): { root: string; nested: string } {
  const root = isolatedTmpdir();
  const init = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
  assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
  const nested = join(root, "src", "deep");
  mkdirSync(nested, { recursive: true });
  return { root, nested };
}

test("init writes both files at the repository root, from anywhere inside it", async () => {
  const { root, nested } = gitRepo();
  const { code, stdout } = await runNode(CONNECT, { args: ["init"], cwd: nested, env: OFFLINE });

  assert.equal(code, 0, stdout);
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Jitera project context/);
  assert.ok(!agents.includes("{{"), "template tokens must be rendered");
  assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /@AGENTS\.md/);
  assert.ok(!existsSync(join(nested, "AGENTS.md")), "nothing may be written at the cwd");
});

test("init refuses to run outside a git repository", async () => {
  const dir = isolatedTmpdir();
  const { code, stderr } = await runNode(CONNECT, { args: ["init"], cwd: dir, env: OFFLINE });

  assert.equal(code, 2);
  assert.match(stderr, /git repository/);
  assert.ok(!existsSync(join(dir, "AGENTS.md")), "must not write outside a repository");
  assert.ok(!existsSync(join(dir, "CLAUDE.md")), "must not write outside a repository");
});

test("init run twice leaves the files unchanged", async () => {
  const { root, nested } = gitRepo();
  await runNode(CONNECT, { args: ["init"], cwd: nested, env: OFFLINE });
  const first = readFileSync(join(root, "AGENTS.md"), "utf8");

  const { code } = await runNode(CONNECT, { args: ["init"], cwd: nested, env: OFFLINE });
  assert.equal(code, 0);
  assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), first);
});

test("a dry run reports without writing", async () => {
  const { root } = gitRepo();
  const { code, stdout } = await runNode(CONNECT, {
    args: ["init", "--dry-run"],
    cwd: root,
    env: OFFLINE,
  });
  assert.equal(code, 0);
  assert.match(stdout, /dry run/);
  assert.ok(!existsSync(join(root, "AGENTS.md")));
});

test("init preserves user content around the managed block", async () => {
  const { root } = gitRepo();
  const existing = "# My project\n\nHand-written notes.\n";
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(root, "AGENTS.md"), existing, "utf8");

  const { code } = await runNode(CONNECT, { args: ["init"], cwd: root, env: OFFLINE });
  assert.equal(code, 0);
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /Hand-written notes\./);
  assert.match(agents, /Jitera project context/);
});

test("init records the environment in a committable .jitera.json", async () => {
  const { root, nested } = gitRepo();
  const { code } = await runNode(CONNECT, {
    args: ["init", "--env=studio-04"],
    cwd: nested,
    env: OFFLINE,
  });
  assert.equal(code, 0);
  const marker = JSON.parse(readFileSync(join(root, ".jitera.json"), "utf8"));
  assert.equal(marker.environment, "studio-04");
});

test("init defaults the recorded environment to production", async () => {
  const { root } = gitRepo();
  await runNode(CONNECT, { args: ["init"], cwd: root, env: OFFLINE });
  const marker = JSON.parse(readFileSync(join(root, ".jitera.json"), "utf8"));
  assert.equal(marker.environment, "studio");
});

test("init records the project when one is given", async () => {
  const { root } = gitRepo();
  await runNode(CONNECT, {
    args: ["init", "--env=studio-04", "--project=abc-123"],
    cwd: root,
    env: OFFLINE,
  });
  const marker = JSON.parse(readFileSync(join(root, ".jitera.json"), "utf8"));
  assert.equal(marker.project, "abc-123");
});

test("a dry run writes no marker either", async () => {
  const { root } = gitRepo();
  await runNode(CONNECT, { args: ["init", "--dry-run"], cwd: root, env: OFFLINE });
  assert.ok(!existsSync(join(root, ".jitera.json")));
});

test("init binds the project from a stored login session", async () => {
  const { writeFileSync } = await import("node:fs");
  const { stubServer } = await import("./helpers.ts");
  const { root, nested } = gitRepo();

  const graphql = await stubServer((body, res) => {
    const op = (body as { operationName?: string }).operationName;
    res.writeHead(200, { "content-type": "application/json" });
    if (op === "ConnectTeams") {
      return res.end(
        JSON.stringify({ data: { teams: [{ slug: "acme", name: "Acme", type: "company" }] } })
      );
    }
    res.end(
      JSON.stringify({
        data: {
          projects: {
            projects: [{ uuid: "proj-uuid-9", name: "Nine", canManageApiKey: true }],
            errors: null,
          },
        },
      })
    );
  });

  const configDir = isolatedTmpdir();
  writeFileSync(
    join(configDir, "session.json"),
    JSON.stringify({
      automationUrl: graphql.url.replace(/\/mcp$/, ""),
      environment: "studio-04",
      accessToken: "at-stored",
    }),
    "utf8"
  );

  const { stdout, code } = await runNode(CONNECT, {
    args: ["init"],
    cwd: nested,
    env: { ...OFFLINE, JITERA_CONNECT_CONFIG_DIR: configDir },
  });
  await graphql.close();

  assert.equal(code, 0, stdout);
  const marker = JSON.parse(readFileSync(join(root, ".jitera.json"), "utf8"));
  assert.equal(marker.project, "proj-uuid-9");
  assert.equal(marker.environment, "studio-04", "environment comes from the stored session");
  assert.match(stdout, /Nine/);
});

test("init without a session explains how to bind a project", async () => {
  const { root } = gitRepo();
  const { stdout, code } = await runNode(CONNECT, { args: ["init"], cwd: root, env: OFFLINE });
  assert.equal(code, 0);
  assert.match(stdout, /sign in once|--project=/);
  const marker = JSON.parse(readFileSync(join(root, ".jitera.json"), "utf8"));
  assert.equal(marker.project, undefined);
});

test("init shows its usage on --help", async () => {
  const { stdout, code } = await runNode(CONNECT, { args: ["init", "--help"] });
  assert.equal(code, 0);
  assert.match(stdout, /usage: npx @jitera\/connect init/);
});

test("init rejects an unknown environment before touching the network", async () => {
  const { root } = gitRepo();
  const { code, stderr } = await runNode(CONNECT, {
    args: ["init", "--env=studio-banana"],
    cwd: root,
  });
  assert.equal(code, 2);
  assert.match(stderr, /studio-banana/);
  assert.ok(!existsSync(join(root, "AGENTS.md")));
});
