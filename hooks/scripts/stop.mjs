#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECKPOINT_EVERY_TURNS = 5;

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function main() {
  const turn = readInput().turn_number;
  if (!Number.isInteger(turn) || turn < 1) process.exit(0);
  if (turn % CHECKPOINT_EVERY_TURNS !== 0) process.exit(0);

  let directive = "";
  try {
    directive = readFileSync(join(ROOT, "content", "checkpoint.md"), "utf8").trim();
  } catch {
    process.exit(0);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext: directive,
      },
    })
  );
}

main();
