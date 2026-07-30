import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function runHook(scriptRelPath, input) {
  return execFileSync(process.execPath, [join(ROOT, scriptRelPath)], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
}

const SESSION_START = "hooks/scripts/session-start.mjs";

test("session start emits a SessionStart additionalContext payload", () => {
  const out = JSON.parse(
    runHook(SESSION_START, {
      hook_event_name: "SessionStart",
      source: "startup",
      cwd: "/tmp/project",
    })
  );
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.ok(out.hookSpecificOutput.additionalContext.length > 0);
});

test("session start directive names the memory tools", () => {
  const out = JSON.parse(runHook(SESSION_START, { source: "startup" }));
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /recall_jitera_memory/);
  assert.match(ctx, /remember_jitera_memory/);
});

test("session start injects after compaction too", () => {
  const out = JSON.parse(runHook(SESSION_START, { source: "compact" }));
  assert.ok(out.hookSpecificOutput.additionalContext.length > 0);
});

test("session start survives empty stdin", () => {
  const stdout = execFileSync(process.execPath, [join(ROOT, SESSION_START)], {
    input: "",
    encoding: "utf8",
  });
  assert.ok(JSON.parse(stdout).hookSpecificOutput.additionalContext);
});

test("session start survives malformed stdin", () => {
  const stdout = execFileSync(process.execPath, [join(ROOT, SESSION_START)], {
    input: "not json at all",
    encoding: "utf8",
  });
  assert.ok(JSON.parse(stdout).hookSpecificOutput.additionalContext);
});

test("session start directive stays brand-neutral", () => {
  const out = JSON.parse(runHook(SESSION_START, { source: "startup" }));
  let ctx = out.hookSpecificOutput.additionalContext;
  for (const tool of ["recall_jitera_memory", "remember_jitera_memory"]) {
    ctx = ctx.replaceAll(tool, "");
  }
  assert.ok(!/jitera/i.test(ctx), "hook text must not name the brand");
  assert.ok(!/\{\{/.test(ctx), "hook text must not contain template tokens");
});

const STOP = "hooks/scripts/stop.mjs";

test("stop stays silent on turns between checkpoints", () => {
  for (const turn of [1, 2, 3, 4, 6, 7]) {
    const out = runHook(STOP, { hook_event_name: "Stop", turn_number: turn });
    assert.equal(out.trim(), "", `turn ${turn} should emit nothing`);
  }
});

test("stop emits a checkpoint directive on every fifth turn", () => {
  for (const turn of [5, 10, 15]) {
    const out = JSON.parse(runHook(STOP, { hook_event_name: "Stop", turn_number: turn }));
    assert.equal(out.hookSpecificOutput.hookEventName, "Stop");
    assert.match(out.hookSpecificOutput.additionalContext, /remember_jitera_memory/);
  }
});

test("stop never blocks the turn", () => {
  const out = JSON.parse(runHook(STOP, { hook_event_name: "Stop", turn_number: 5 }));
  assert.equal(out.decision, undefined);
});

test("stop stays silent when turn_number is absent", () => {
  assert.equal(runHook(STOP, { hook_event_name: "Stop" }).trim(), "");
});

test("stop survives malformed stdin", () => {
  const stdout = execFileSync(process.execPath, [join(ROOT, STOP)], {
    input: "}{",
    encoding: "utf8",
  });
  assert.equal(stdout.trim(), "");
});
