#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { emitContext, readHookInput } from "../hook-io.ts";

const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content");
const CHECKPOINT_EVERY_TURNS = 5;

const turn = readHookInput().turn_number;
if (!Number.isInteger(turn) || (turn as number) < 1) process.exit(0);
if ((turn as number) % CHECKPOINT_EVERY_TURNS !== 0) process.exit(0);

let directive: string;
try {
  directive = readFileSync(join(CONTENT_ROOT, "checkpoint.md"), "utf8").trim();
} catch {
  process.exit(0);
}

emitContext("Stop", directive);
