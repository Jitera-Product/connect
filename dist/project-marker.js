import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
export const MARKER_FILENAME = ".jitera.json";
// Environments are studio, studio-stage, studio-NN. Anything else in the file
// is not echoed back into session context.
const SAFE_ENVIRONMENT = /^[A-Za-z0-9-]{1,64}$/;
export function readProjectMarker(startDir) {
    let dir = startDir;
    for (;;) {
        const path = join(dir, MARKER_FILENAME);
        if (existsSync(path)) {
            let parsed;
            try {
                parsed = JSON.parse(readFileSync(path, "utf8"));
            }
            catch {
                return undefined;
            }
            const environment = parsed["environment"];
            const project = parsed["project"];
            return {
                path,
                ...(typeof environment === "string" && SAFE_ENVIRONMENT.test(environment)
                    ? { environment }
                    : {}),
                ...(typeof project === "string" ? { project } : {}),
            };
        }
        const parent = dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
export function writeProjectMarker(root, marker, dryRun = false) {
    const path = join(root, MARKER_FILENAME);
    let existing = {};
    let before;
    if (existsSync(path)) {
        before = readFileSync(path, "utf8");
        try {
            existing = JSON.parse(before);
        }
        catch {
            existing = {};
        }
    }
    const next = {
        ...existing,
        ...(marker.environment ? { environment: marker.environment } : {}),
        ...(marker.project ? { project: marker.project } : {}),
    };
    const serialized = `${JSON.stringify(next, undefined, 2)}\n`;
    const changed = before !== serialized;
    if (changed && !dryRun)
        writeFileSync(path, serialized, "utf8");
    return { path, changed };
}
//# sourceMappingURL=project-marker.js.map