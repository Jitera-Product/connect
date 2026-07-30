#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function drainStdin() {
  try {
    readFileSync(0, "utf8");
  } catch {
    return;
  }
}

function main() {
  drainStdin();

  let directive = "";
  try {
    directive = readFileSync(join(ROOT, "content", "session-start.md"), "utf8").trim();
  } catch {
    process.exit(0);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: directive,
      },
    })
  );
}

main();
