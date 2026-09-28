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

// The reported bug: with a long list the highlight scrolled out of sight, and
// each redraw left the previous copy behind so the list seemed to duplicate.
// This models the terminal the picker writes to, so the assertions are about
// what a person actually sees.
function screenOf(chunks: readonly string[]): string[] {
  const rows: string[] = [];
  let row = 0;
  let column = 0;
  const line = (): string => (rows[row] ??= "");

  for (const part of chunks.join("").split(/(\u001b\[\??\d*[A-Za-z])/)) {
    const escape = /^\u001b\[\??(\d*)([A-Za-z])$/.exec(part);
    if (escape) {
      const count = Number(escape[1]) || 1;
      if (escape[2] === "A") row = Math.max(0, row - count);
      else if (escape[2] === "J") rows.length = row + 1;
      else if (escape[2] === "K") rows[row] = "";
      continue;
    }
    for (const character of part) {
      if (character === "\n") {
        row += 1;
        column = 0;
      } else if (character === "\r") {
        column = 0;
      } else {
        const current = line();
        rows[row] = current.slice(0, column) + character + current.slice(column + 1);
        column += 1;
      }
    }
  }
  return rows;
}

function windowedSelecting(count = 30, viewport = 5, columns = 80) {
  const items = Array.from({ length: count }, (_item, index) => `project ${index + 1}`);
  const input = new FakeInput();
  const written: string[] = [];
  const picked = interactiveSelect({
    items,
    prompt: "Which project?",
    label: (item) => item,
    theme,
    input,
    output: { write: (chunk: string) => written.push(chunk) },
    viewport,
    columns,
  });
  const press = (...keys: string[]) => {
    for (const key of keys) input.emit("data", Buffer.from(key));
  };
  return { picked, press, input, screen: () => screenOf(written) };
}

test("a long list draws a window around the highlight, so the selection stays visible", async () => {
  const { picked, press, screen } = windowedSelecting();
  press(...Array.from({ length: 12 }, () => "\u001b[B"));
  const rows = screen().filter((row) => row.trim() !== "");
  assert.ok(rows.some((row) => row.includes("❯ project 13")), "the highlighted project is on screen");
  assert.ok(rows.some((row) => row.includes("13/30")), "the position in the full list is shown");
  press("\r");
  assert.equal(await picked, "project 13");
});

test("the window scrolls back up without leaving a copy behind", async () => {
  const { picked, press, screen } = windowedSelecting();
  press(...Array.from({ length: 20 }, () => "\u001b[B"));
  press(...Array.from({ length: 15 }, () => "\u001b[A"));
  const rows = screen().filter((row) => row.trim() !== "");
  const shown = rows.filter((row) => /project \d+/.test(row));
  assert.equal(shown.length, new Set(shown).size, `no row is drawn twice: ${JSON.stringify(shown)}`);
  assert.ok(rows.some((row) => row.includes("❯ project 6")), "the highlight is still on screen");
  press("\r");
  assert.equal(await picked, "project 6");
});

test("a name too long for the terminal is cut to one line", async () => {
  const input = new FakeInput();
  const written: string[] = [];
  const items = ["a project name long enough to wrap in a narrow terminal", "short"];
  const picked = interactiveSelect({
    items,
    prompt: "Which project?",
    label: (item) => item,
    theme,
    input,
    output: { write: (chunk: string) => written.push(chunk) },
    columns: 30,
  });
  input.emit("data", Buffer.from("\u001b[B"));
  const rows = screenOf(written);
  assert.ok(
    rows.some((row) => row.includes("a project name long")),
    `the name is drawn: ${JSON.stringify(rows)}`
  );
  assert.ok(
    !rows.some((row) => row.includes("terminal")),
    `the name is cut rather than wrapped: ${JSON.stringify(rows)}`
  );
  input.emit("data", Buffer.from("\r"));
  await picked;
});

test("a short list is drawn whole, with no counter", async () => {
  const { picked, press, screen } = windowedSelecting(3, 5, 80);
  press("\u001b[B");
  const rows = screen().filter((row) => row.trim() !== "");
  assert.ok(rows.some((row) => row.includes("❯ project 2")));
  assert.ok(!rows.some((row) => row.includes("/3")), "a list that fits shows no counter");
  press("\r");
  assert.equal(await picked, "project 2");
});

function multiSelecting(
  items: readonly string[] = ["alpha", "beta", "gamma"],
  selected?: (item: string) => boolean,
  requireOne = false
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
    requireOne,
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


// The video's failure: the picker opened, enter was pressed without space, and
// a choice nobody made was recorded as "every agent" - which writes no agents
// key, so the file looked untouched and the command looked like a no-op.

test("confirming an empty picker does not settle it when one is required", async () => {
  const { picked, press, rendered } = multiSelecting(["alpha", "beta"], undefined, true);
  press("\r");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(rendered(), /nothing ticked yet/);

  // Still open, so a real answer can still be given.
  press(" ", "\r");
  assert.deepEqual(await picked, ["alpha"]);
});

test("requiring one does not stop a deliberate select-all", async () => {
  const { picked, press } = multiSelecting(["alpha", "beta"], undefined, true);
  press("a", "\r");
  assert.deepEqual(await picked, ["alpha", "beta"]);
});

test("without the requirement an empty confirm still means none", async () => {
  const { picked, press } = multiSelecting(["alpha", "beta"]);
  press("\r");
  assert.deepEqual(await picked, []);
});
