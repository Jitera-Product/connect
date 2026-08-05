#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { readProjectMarker } from "../project-marker.js";
import { readSessionStatus } from "../session-status.js";
import { renderStatusLine } from "../statusline.js";
let input = {};
try {
    input = JSON.parse(readFileSync(0, "utf8"));
}
catch {
    input = {};
}
const dir = input.workspace?.project_dir ?? input.workspace?.current_dir ?? input.cwd;
const marker = dir ? readProjectMarker(dir) : undefined;
const status = readSessionStatus(input.session_id);
process.stdout.write(`${renderStatusLine({ status, markerEnvironment: marker?.environment })}\n`);
//# sourceMappingURL=statusline.js.map