#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { emitContext, readHookInput } from "../hook-io.ts";
import { readProjectMarker } from "../project-marker.ts";

const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content");
const CHECKPOINT_EVERY_TURNS = 5;

const input = readHookInput();
const turn = input.turn_number;
if (!Number.isInteger(turn) || (turn as number) < 1) process.exit(0);
if ((turn as number) % CHECKPOINT_EVERY_TURNS !== 0) process.exit(0);

// The checkpoint asks the model to write to project memory, which needs a
// project. Unbound repositories get nothing, same as the other hooks.
if (!readProjectMarker(input.cwd ?? process.cwd())) process.exit(0);

let directive: string;
try {
  directive = readFileSync(join(CONTENT_ROOT, "checkpoint.md"), "utf8").trim();
} catch {
  process.exit(0);
}

emitContext("Stop", directive);
