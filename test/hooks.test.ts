import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isolatedTmpdir, runNode } from "./helpers.ts";

const SESSION_START = "dist/hooks/session-start.js";
const STOP = "dist/hooks/stop.js";

const CONFIGURED = { CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk-test" };

// Every hook now refuses to act in a repository with no .jitera.json.
const BOUND = (() => {
  const root = isolatedTmpdir();
  writeFileSync(join(root, ".jitera.json"), JSON.stringify({ environment: "studio" }), "utf8");
  return root;
})();

interface HookOutput {
  readonly hookSpecificOutput?: {
    readonly hookEventName: string;
    readonly additionalContext: string;
  };
  readonly decision?: string;
}

async function hook(script: string, input: unknown, env: NodeJS.ProcessEnv = {}): Promise<string> {
  return (await runNode(script, { input, env })).stdout;
}

async function context(
  script: string,
  input: unknown,
  env: NodeJS.ProcessEnv = {}
): Promise<string> {
  const parsed = JSON.parse(await hook(script, input, env)) as HookOutput;
  assert.ok(parsed.hookSpecificOutput, "expected hookSpecificOutput");
  return parsed.hookSpecificOutput.additionalContext;
}

test("session start emits a SessionStart additionalContext payload", async () => {
  const parsed = JSON.parse(
    await hook(
      SESSION_START,
      { hook_event_name: "SessionStart", source: "startup", cwd: "/tmp/project" },
      CONFIGURED
    )
  ) as HookOutput;
  assert.equal(parsed.hookSpecificOutput?.hookEventName, "SessionStart");
  assert.ok((parsed.hookSpecificOutput?.additionalContext.length ?? 0) > 0);
});

test("the configured directive names the memory tools", async () => {
  const cwd = markedRepo({ environment: "studio" });
  const ctx = await context(SESSION_START, { source: "startup", cwd }, CONFIGURED);
  assert.match(ctx, /recall_jitera_memory/);
  assert.match(ctx, /remember_jitera_memory/);
});

test("the configured directive never claims a live connection", async () => {
  const cwd = markedRepo({ environment: "studio" });
  const ctx = await context(SESSION_START, { source: "startup", cwd }, CONFIGURED);
  assert.ok(!/\bconnected\b/i.test(ctx), "the hook cannot know the server is reachable");
  assert.match(ctx, /if the tools are missing/i, "must tell the model what to do on failure");
});

test("session start injects after compaction too", async () => {
  const cwd = markedRepo({ environment: "studio" });
  assert.ok((await context(SESSION_START, { source: "compact", cwd }, CONFIGURED)).length > 0);
});

test("session start survives empty stdin", async () => {
  const { stdout } = await runNode(SESSION_START, { env: CONFIGURED });
  assert.ok((JSON.parse(stdout) as HookOutput).hookSpecificOutput?.additionalContext);
});

test("the configured directive stays brand-neutral", async () => {
  const cwd = markedRepo({ environment: "studio" });
  let ctx = await context(SESSION_START, { source: "startup", cwd }, CONFIGURED);
  for (const tool of [
    "gather_jitera_context",
    "recall_jitera_memory",
    "remember_jitera_memory",
  ]) {
    ctx = ctx.replaceAll(tool, "");
  }
  assert.ok(!/jitera/i.test(ctx), "hook text must not name the brand");
  assert.ok(!/\{\{/.test(ctx), "hook text must not contain template tokens");
});

test("without a key the hook says the tools are unavailable", async () => {
  const ctx = await context(SESSION_START, { source: "startup" });
  assert.match(ctx, /no API key is configured/i);
  assert.match(ctx, /unavailable/i);
  assert.match(ctx, /Do not call/);
});

test("the unconfigured note tells the user how to connect", async () => {
  const ctx = await context(SESSION_START, { source: "startup" });
  assert.match(ctx, /npx @jitera\/connect login --install/);
  assert.match(ctx, /\/plugin/);
});

test("a blank key counts as unconfigured", async () => {
  const ctx = await context(
    SESSION_START,
    { source: "startup" },
    { CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "   " }
  );
  assert.match(ctx, /unavailable/i);
});

function markedRepo(marker: unknown): string {
  const root = isolatedTmpdir();
  const raw = typeof marker === "string" ? marker : JSON.stringify(marker);
  writeFileSync(join(root, ".jitera.json"), raw, "utf8");
  const nested = join(root, "src", "deep");
  mkdirSync(nested, { recursive: true });
  return nested;
}

test("an unconfigured session in a marked repo names the exact login command", async () => {
  const cwd = markedRepo({ environment: "studio-05" });
  const ctx = await context(SESSION_START, { source: "startup", cwd });
  assert.match(ctx, /\.jitera\.json/);
  assert.match(ctx, /studio-05/);
  assert.match(ctx, /login --env=studio-05 --install/);
});

test("a configured session warns when the plugin environment differs from the repo's", async () => {
  const cwd = markedRepo({ environment: "studio-05" });
  const ctx = await context(
    SESSION_START,
    { source: "startup", cwd },
    { ...CONFIGURED, CLAUDE_PLUGIN_OPTION_ENVIRONMENT: "studio" }
  );
  assert.match(ctx, /"studio-05"/);
  assert.match(ctx, /configured for "studio"/);
  assert.match(ctx, /login --env=studio-05 --install/);
});

test("a matching environment adds no override note", async () => {
  const cwd = markedRepo({ environment: "studio-05" });
  const ctx = await context(
    SESSION_START,
    { source: "startup", cwd },
    { ...CONFIGURED, CLAUDE_PLUGIN_OPTION_ENVIRONMENT: "studio-05" }
  );
  assert.ok(!/declares environment/.test(ctx), "no warning when environments agree");
});

test("a malformed marker never breaks the hook", async () => {
  const cwd = markedRepo("{ not json");
  const ctx = await context(SESSION_START, { source: "startup", cwd }, CONFIGURED);
  // Unreadable is treated as unbound rather than acted on, so the session is
  // told how to bind the repository instead of reading a guessed project.
  assert.match(ctx, /npx @jitera\/connect init/);
});

test("a connected session in an unbound repo asks the user to run init", async () => {
  const ctx = await context(
    SESSION_START,
    { source: "startup", cwd: isolatedTmpdir() },
    CONFIGURED
  );
  assert.match(ctx, /not bound to a project/i);
  assert.match(ctx, /npx @jitera\/connect init/);
  assert.match(ctx, /Do not call/);
});

test("an unbound repo is not told to call the context tools", async () => {
  const ctx = await context(
    SESSION_START,
    { source: "startup", cwd: isolatedTmpdir() },
    CONFIGURED
  );
  assert.ok(
    !/call `gather_jitera_context`/.test(ctx),
    "there is no project to gather context from"
  );
});

test("a suspicious environment value is ignored rather than echoed", async () => {
  const cwd = markedRepo({ environment: "studio-05; rm -rf /" });
  const ctx = await context(SESSION_START, { source: "startup", cwd });
  assert.ok(!/rm -rf/.test(ctx), "unvalidated file content must not be echoed");
});

test("stop stays silent on turns between checkpoints", async () => {
  for (const turn of [1, 2, 3, 4, 6, 7]) {
    const out = await hook(STOP, { hook_event_name: "Stop", turn_number: turn, cwd: BOUND });
    assert.equal(out.trim(), "", `turn ${turn} should emit nothing`);
  }
});

test("stop emits a checkpoint directive on every fifth turn", async () => {
  for (const turn of [5, 10, 15]) {
    const ctx = await context(STOP, { hook_event_name: "Stop", turn_number: turn, cwd: BOUND });
    assert.match(ctx, /remember_jitera_memory/);
  }
});

test("stop never blocks the turn", async () => {
  const parsed = JSON.parse(
    await hook(STOP, { hook_event_name: "Stop", turn_number: 5, cwd: BOUND })
  ) as HookOutput;
  assert.equal(parsed.decision, undefined);
});

test("stop stays silent when turn_number is absent", async () => {
  assert.equal((await hook(STOP, { hook_event_name: "Stop", cwd: BOUND })).trim(), "");
});

test("stop survives malformed stdin", async () => {
  const { stdout } = await runNode(STOP, {});
  assert.equal(stdout.trim(), "");
});

test("the checkpoint stays silent in an unbound repository", async () => {
  const out = await hook(STOP, {
    hook_event_name: "Stop",
    turn_number: 5,
    cwd: isolatedTmpdir(),
  });
  assert.equal(out.trim(), "", "there is no project memory to checkpoint into");
});
