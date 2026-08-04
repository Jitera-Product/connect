import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { createTheme } from "../src/theme.ts";
import { SelectCancelledError, interactiveSelect } from "../src/select.ts";

const theme = createTheme({ env: { NO_COLOR: "1" } as NodeJS.ProcessEnv, isTty: true });

class FakeInput extends EventEmitter {
  rawModes: boolean[] = [];
  paused = false;

  setRawMode(mode: boolean): this {
    this.rawModes.push(mode);
    return this;
  }

  resume(): this {
    this.paused = false;
    return this;
  }

  pause(): this {
    this.paused = true;
    return this;
  }
}

function selecting(items: readonly string[] = ["alpha", "beta", "gamma"]) {
  const input = new FakeInput();
  const written: string[] = [];
  const picked = interactiveSelect({
    items,
    prompt: "Which one?",
    label: (item) => item,
    theme,
    input,
    output: { write: (chunk: string) => written.push(chunk) },
  });
  const press = (...keys: string[]) => {
    for (const key of keys) input.emit("data", Buffer.from(key));
  };
  return { picked, press, input, rendered: () => written.join("") };
}

test("enter confirms the first item by default", async () => {
  const { picked, press } = selecting();
  press("\r");
  assert.equal(await picked, "alpha");
});

test("the down arrow moves the highlight before confirming", async () => {
  const { picked, press } = selecting();
  press("[B", "\r");
  assert.equal(await picked, "beta");
});

test("the up arrow wraps from the first item to the last", async () => {
  const { picked, press } = selecting();
  press("[A", "\r");
  assert.equal(await picked, "gamma");
});

test("the down arrow wraps from the last item to the first", async () => {
  const { picked, press } = selecting();
  press("[B", "[B", "[B", "\r");
  assert.equal(await picked, "alpha");
});

test("j and k move like arrows", async () => {
  const { picked, press } = selecting();
  press("j", "j", "k", "\r");
  assert.equal(await picked, "beta");
});

test("typing a digit jumps the highlight to that entry", async () => {
  const { picked, press } = selecting();
  press("3", "\r");
  assert.equal(await picked, "gamma");
});

test("a digit beyond the list is ignored", async () => {
  const { picked, press } = selecting();
  press("9", "\r");
  assert.equal(await picked, "alpha");
});

test("the highlighted row carries the pointer", async () => {
  const { picked, press, rendered } = selecting();
  press("[B", "\r");
  await picked;
  assert.ok(rendered().includes("  ❯ beta"), "beta was highlighted after moving down");
  assert.ok(rendered().includes("    alpha"), "unhighlighted rows are plain");
});

test("confirming erases the menu and restores the cursor", async () => {
  const { picked, press, input, rendered } = selecting();
  press("\r");
  await picked;
  assert.ok(rendered().includes("[J"), "the drawn menu is cleared");
  assert.ok(rendered().endsWith("[?25h"), "the cursor is shown again");
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(input.paused, true);
});

test("ctrl-c cancels and still restores the terminal", async () => {
  const { picked, press, input, rendered } = selecting();
  press("");
  await assert.rejects(picked, SelectCancelledError);
  assert.ok(rendered().includes("[?25h"), "the cursor is shown again");
  assert.deepEqual(input.rawModes, [true, false]);
});

test("escape cancels too", async () => {
  const { picked, press } = selecting();
  press("");
  await assert.rejects(picked, SelectCancelledError);
});

test("an empty list rejects instead of hanging", async () => {
  const input = new FakeInput();
  await assert.rejects(
    interactiveSelect({
      items: [],
      prompt: "Which one?",
      label: String,
      theme,
      input,
      output: { write: () => true },
    })
  );
});
