#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { readProjectMarker } from "../project-marker.ts";
import { readSessionStatus } from "../session-status.ts";
import { renderStatusLine } from "../statusline.ts";

interface StatusInput {
  readonly session_id?: string;
  readonly cwd?: string;
  readonly workspace?: { readonly current_dir?: string; readonly project_dir?: string };
}

let input: StatusInput = {};
try {
  input = JSON.parse(readFileSync(0, "utf8")) as StatusInput;
} catch {
  input = {};
}

const dir = input.workspace?.project_dir ?? input.workspace?.current_dir ?? input.cwd;
const marker = dir ? readProjectMarker(dir) : undefined;
const status = readSessionStatus(input.session_id);

process.stdout.write(
  `${renderStatusLine({
    status,
    markerEnvironment: marker?.environment,
    // No directory to inspect is not the same as an unbound repository.
    bound: dir ? marker !== undefined : undefined,
  })}\n`
);
