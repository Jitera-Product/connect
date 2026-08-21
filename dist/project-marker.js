import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
export const MARKER_FILENAME = ".jitera.json";
// Environments are studio, studio-stage, studio-NN. Anything else in the file
// is not echoed back into session context.
const SAFE_ENVIRONMENT = /^[A-Za-z0-9-]{1,64}$/;
// A committed marker is editable by hand, and every selected id becomes a
// clause in the server's filter, so the list is bounded rather than trusted.
const MAX_AGENTS = 100;
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
            // `null` parses cleanly and then throws on property access, and a array
            // or a bare scalar is not a marker either. Malformed reads as unbound,
            // the same as unparseable, because hooks must never break a session.
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
                return undefined;
            }
            const fields = parsed;
            const environment = fields["environment"];
            const project = fields["project"];
            const agents = fields["agents"];
            // Trimmed and de-duplicated: an id with stray whitespace matches no
            // partition on the server and would silently narrow recall to nothing.
            const agentIds = Array.isArray(agents)
                ? [
                    ...new Set(agents
                        .filter((id) => typeof id === "string")
                        .map((id) => id.trim())
                        .filter((id) => id !== "")),
                ].slice(0, MAX_AGENTS)
                : undefined;
            return {
                path,
                ...(typeof environment === "string" && SAFE_ENVIRONMENT.test(environment)
                    ? { environment }
                    : {}),
                ...(typeof project === "string" ? { project } : {}),
                ...(agentIds && agentIds.length > 0 ? { agents: agentIds } : {}),
            };
        }
        // Never look past the repository root. `init` writes the marker there, so
        // a stray .jitera.json in a parent directory (or $HOME) would otherwise
        // bind every repository beneath it to a project nobody chose for them.
        if (existsSync(join(dir, ".git")))
            return undefined;
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
    // An empty list is a real choice - "read every agent" - and has to erase a
    // previous selection rather than be mistaken for "leave it alone".
    if (marker.agents) {
        const ids = [
            ...new Set(marker.agents.map((id) => id.trim()).filter((id) => id !== "")),
        ].slice(0, MAX_AGENTS);
        if (ids.length > 0)
            next["agents"] = ids;
        else
            delete next["agents"];
    }
    const serialized = `${JSON.stringify(next, undefined, 2)}\n`;
    const changed = before !== serialized;
    if (changed && !dryRun)
        writeFileSync(path, serialized, "utf8");
    return { path, changed };
}
//# sourceMappingURL=project-marker.js.map