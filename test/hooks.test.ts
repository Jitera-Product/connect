import test from "node:test";
import assert from "node:assert/strict";

import { runNode } from "./helpers.ts";

const SESSION_START = "dist/hooks/session-start.js";
const STOP = "dist/hooks/stop.js";

interface HookOutput {
  readonly hookSpecificOutput?: {
    readonly hookEventName: string;
    readonly additionalContext: string;
  };
  readonly decision?: string;
}

async function hook(script: string, input: unknown): Promise<string> {
  return (await runNode(script, { input })).stdout;
}

async function context(script: string, input: unknown): Promise<string> {
  const parsed = JSON.parse(await hook(script, input)) as HookOutput;
  assert.ok(parsed.hookSpecificOutput, "expected hookSpecificOutput");
  return parsed.hookSpecificOutput.additionalContext;
}

test("session start emits a SessionStart additionalContext payload", async () => {
  const parsed = JSON.parse(
    await hook(SESSION_START, {
      hook_event_name: "SessionStart",
      source: "startup",
      cwd: "/tmp/project",
    })
  ) as HookOutput;
  assert.equal(parsed.hookSpecificOutput?.hookEventName, "SessionStart");
  assert.ok((parsed.hookSpecificOutput?.additionalContext.length ?? 0) > 0);
});

test("session start directive names the memory tools", async () => {
  const ctx = await context(SESSION_START, { source: "startup" });
  assert.match(ctx, /recall_jitera_memory/);
  assert.match(ctx, /remember_jitera_memory/);
});

test("session start injects after compaction too", async () => {
  assert.ok((await context(SESSION_START, { source: "compact" })).length > 0);
});

test("session start survives empty stdin", async () => {
  const { stdout } = await runNode(SESSION_START, {});
  assert.ok((JSON.parse(stdout) as HookOutput).hookSpecificOutput?.additionalContext);
});

test("session start directive stays brand-neutral", async () => {
  let ctx = await context(SESSION_START, { source: "startup" });
  for (const tool of ["recall_jitera_memory", "remember_jitera_memory"]) {
    ctx = ctx.replaceAll(tool, "");
  }
  assert.ok(!/jitera/i.test(ctx), "hook text must not name the brand");
  assert.ok(!/\{\{/.test(ctx), "hook text must not contain template tokens");
});

test("stop stays silent on turns between checkpoints", async () => {
  for (const turn of [1, 2, 3, 4, 6, 7]) {
    const out = await hook(STOP, { hook_event_name: "Stop", turn_number: turn });
    assert.equal(out.trim(), "", `turn ${turn} should emit nothing`);
  }
});

test("stop emits a checkpoint directive on every fifth turn", async () => {
  for (const turn of [5, 10, 15]) {
    const ctx = await context(STOP, { hook_event_name: "Stop", turn_number: turn });
    assert.match(ctx, /remember_jitera_memory/);
  }
});

test("stop never blocks the turn", async () => {
  const parsed = JSON.parse(await hook(STOP, { hook_event_name: "Stop", turn_number: 5 })) as HookOutput;
  assert.equal(parsed.decision, undefined);
});

test("stop stays silent when turn_number is absent", async () => {
  assert.equal((await hook(STOP, { hook_event_name: "Stop" })).trim(), "");
});

test("stop survives malformed stdin", async () => {
  const { stdout } = await runNode(STOP, {});
  assert.equal(stdout.trim(), "");
});
