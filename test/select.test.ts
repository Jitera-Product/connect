import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { createTheme } from "../src/theme.ts";
import { SelectCancelledError, interactiveSelect, multiSelect } from "../src/select.ts";

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

function multiSelecting(
  items: readonly string[] = ["alpha", "beta", "gamma"],
  selected?: (item: string) => boolean
) {
  const input = new FakeInput();
  const written: string[] = [];
  const picked = multiSelect({
    items,
    prompt: "Which ones?",
    label: (item) => item,
    theme,
    input,
    output: { write: (chunk: string) => written.push(chunk) },
    ...(selected ? { selected } : {}),
  });
  const press = (...keys: string[]) => {
    for (const key of keys) input.emit("data", Buffer.from(key));
  };
  return { picked, press, input, rendered: () => written.join("") };
}

test("space ticks the highlighted item and enter saves it", async () => {
  const { picked, press } = multiSelecting();
  press(" ", "\r");
  assert.deepEqual(await picked, ["alpha"]);
});

test("several items can be ticked", async () => {
  const { picked, press } = multiSelecting();
  press(" ", "\u001b[B", "\u001b[B", " ", "\r");
  assert.deepEqual(await picked, ["alpha", "gamma"]);
});

test("space toggles, so pressing it twice unticks", async () => {
  const { picked, press } = multiSelecting();
  press(" ", " ", "\r");
  assert.deepEqual(await picked, []);
});

test("saving with nothing ticked is allowed, and means every agent", async () => {
  const { picked, press } = multiSelecting();
  press("\r");
  assert.deepEqual(await picked, []);
});

test("a starts from everything ticked and n clears it", async () => {
  const all = multiSelecting();
  all.press("a", "\r");
  assert.deepEqual(await all.picked, ["alpha", "beta", "gamma"]);

  const none = multiSelecting();
  none.press("a", "n", "\r");
  assert.deepEqual(await none.picked, []);
});

test("the current selection starts ticked, so re-running shows today's state", async () => {
  const { picked, press } = multiSelecting(["alpha", "beta", "gamma"], (item) => item === "beta");
  press("\r");
  assert.deepEqual(await picked, ["beta"]);
});

test("checkboxes are drawn for every row", async () => {
  const { picked, press, rendered } = multiSelecting();
  press(" ");
  const frame = rendered();
  assert.match(frame, /\[x\]/, "the ticked row shows a filled box");
  assert.match(frame, /\[ \]/, "unticked rows show an empty box");
  press("\r");
  await picked;
});

test("escape cancels a multi-select without saving", async () => {
  const { picked, press } = multiSelecting();
  press(" ", "\u001b");
  await assert.rejects(picked, (error: unknown) => error instanceof SelectCancelledError);
});

test("a multi-select restores the cursor and leaves raw mode", async () => {
  const { picked, press, input, rendered } = multiSelecting();
  press("\r");
  await picked;
  assert.deepEqual(input.rawModes, [true, false]);
  assert.match(rendered(), /\u001b\[\?25h/, "the cursor is shown again");
});


// Terminals batch and split keypresses: two keys can arrive in one read, and an
// escape sequence can be split across two. Decoding is node's job now, and
// these are the behaviours that has to produce.

test("an arrow split across reads moves, and does not cancel", async () => {
  const { picked, press } = multiSelecting();
  // What a terminal can deliver: the escape alone, then the remainder.
  press("\u001b", "[B");
  press(" ", "\r");
  assert.deepEqual(await picked, ["beta"]);
});

test("two keys arriving in one chunk are both applied", async () => {
  const { picked, press } = multiSelecting();
  press("\u001b[B ");
  press("\r");
  assert.deepEqual(await picked, ["beta"]);
});

test("a real escape still cancels once nothing follows it", async () => {
  const { picked, press } = multiSelecting();
  press("\u001b");
  await assert.rejects(picked, (error: Error) => error instanceof SelectCancelledError);
});
