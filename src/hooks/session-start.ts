#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { emitContext, readHookInput } from "../hook-io.ts";

const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content");

readHookInput();

let directive: string;
try {
  directive = readFileSync(join(CONTENT_ROOT, "session-start.md"), "utf8").trim();
} catch {
  process.exit(0);
}

emitContext("SessionStart", directive);
