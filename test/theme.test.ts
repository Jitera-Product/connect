import test from "node:test";
import assert from "node:assert/strict";

import { createTheme, detectLevel, heading, startSpinner } from "../src/theme.ts";

const ESC = "";
const TRUECOLOR = { COLORTERM: "truecolor" } as NodeJS.ProcessEnv;

test("colour is off when the output is not a terminal", () => {
  assert.equal(detectLevel({ env: TRUECOLOR, isTty: false }), 0);
});

test("NO_COLOR wins over everything else", () => {
  assert.equal(detectLevel({ env: { ...TRUECOLOR, NO_COLOR: "1" }, isTty: true }), 0);
  assert.equal(
    detectLevel({ env: { ...TRUECOLOR, NO_COLOR: "1", FORCE_COLOR: "1" }, isTty: true }),
    0
  );
});

test("an empty NO_COLOR is not treated as set", () => {
  assert.equal(detectLevel({ env: { ...TRUECOLOR, NO_COLOR: "" }, isTty: true }), 2);
});

test("FORCE_COLOR enables colour without a terminal", () => {
  assert.equal(detectLevel({ env: { FORCE_COLOR: "1" }, isTty: false }), 1);
  assert.equal(detectLevel({ env: { ...TRUECOLOR, FORCE_COLOR: "1" }, isTty: false }), 2);
  assert.equal(detectLevel({ env: { FORCE_COLOR: "0" }, isTty: true }), 0);
});

test("a dumb terminal gets no colour", () => {
  assert.equal(detectLevel({ env: { TERM: "dumb" }, isTty: true }), 0);
});

test("truecolor uses the brand gradient stops", () => {
  const theme = createTheme({ env: TRUECOLOR, isTty: true });
  assert.equal(theme.level, 2);
  assert.ok(theme.mark.includes("38;2;6;25;255"), "first glyph is the brand blue");
  assert.ok(theme.mark.includes("38;2;25;179;227"), "second glyph is the accent");
});

test("a basic terminal falls back to the standard blue and cyan", () => {
  const theme = createTheme({ env: { TERM: "xterm" }, isTty: true });
  assert.equal(theme.level, 1);
  assert.ok(theme.mark.includes(`${ESC}[34m`));
  assert.ok(theme.mark.includes(`${ESC}[36m`));
  assert.ok(!theme.mark.includes("38;2;"));
});

test("without colour the output carries no escape sequences", () => {
  const theme = createTheme({ env: {}, isTty: false });
  const line = heading(theme, "Acme", "connect");
  assert.equal(theme.mark, "▶▶");
  assert.ok(!line.includes(ESC), JSON.stringify(line));
  assert.match(line, /Acme/);
});

test("the heading uses the discovered brand rather than a hardcoded one", () => {
  const theme = createTheme({ env: {}, isTty: false });
  const line = heading(theme, "Northwind", "connect");
  assert.match(line, /Northwind/);
  assert.ok(!line.includes("Jitera"));
});

test("a spinner that is not animating prints its label once", () => {
  const chunks: string[] = [];
  const theme = createTheme({ env: {}, isTty: false });
  const spinner = startSpinner({
    theme,
    label: "Waiting…",
    write: (chunk) => chunks.push(chunk),
    animate: false,
  });
  spinner.stop("Approved.");

  assert.deepEqual(chunks, ["  Waiting…\n", "  Approved.\n"]);
  assert.ok(!chunks.join("").includes("\r"));
});

test("an animated spinner clears its line when stopped", () => {
  const chunks: string[] = [];
  const theme = createTheme({ env: TRUECOLOR, isTty: true });
  const spinner = startSpinner({
    theme,
    label: "Waiting…",
    write: (chunk) => chunks.push(chunk),
    animate: true,
  });
  spinner.stop();

  assert.ok(chunks[0]?.startsWith("\r"));
  assert.ok(chunks.at(-1)?.endsWith("\r"));
});
