import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MARKER_FILENAME = ".jitera.json";

// Environments are studio, studio-stage, studio-NN. Anything else in the file
// is not echoed back into session context.
const SAFE_ENVIRONMENT = /^[A-Za-z0-9-]{1,64}$/;

// A committed marker is editable by hand, and every selected id becomes a
// clause in the server's filter, so the list is bounded rather than trusted.
const MAX_AGENTS = 100;

export interface ProjectMarker {
  readonly environment?: string | undefined;
  readonly project?: string | undefined;
  // Which agents' memory this repository reads. Absent means every agent in
  // the project, which is the default and what most repositories want.
  readonly agents?: readonly string[] | undefined;
}

export interface FoundProjectMarker extends ProjectMarker {
  readonly path: string;
}

export function readProjectMarker(startDir: string): FoundProjectMarker | undefined {
  let dir = startDir;
  for (;;) {
    const path = join(dir, MARKER_FILENAME);
    if (existsSync(path)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        return undefined;
      }

      // `null` parses cleanly and then throws on property access, and a array
      // or a bare scalar is not a marker either. Malformed reads as unbound,
      // the same as unparseable, because hooks must never break a session.
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return undefined;
      }
      const fields = parsed as Record<string, unknown>;
      const environment = fields["environment"];
      const project = fields["project"];
      const agents = fields["agents"];
      // Trimmed and de-duplicated: an id with stray whitespace matches no
      // partition on the server and would silently narrow recall to nothing.
      const agentIds = Array.isArray(agents)
        ? [
            ...new Set(
              agents
                .filter((id): id is string => typeof id === "string")
                .map((id) => id.trim())
                .filter((id) => id !== "")
            ),
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
    if (existsSync(join(dir, ".git"))) return undefined;

    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface MarkerWriteResult {
  readonly path: string;
  readonly changed: boolean;
}

export function writeProjectMarker(
  root: string,
  marker: ProjectMarker,
  dryRun = false
): MarkerWriteResult {
  const path = join(root, MARKER_FILENAME);

  let existing: Record<string, unknown> = {};
  let before: string | undefined;
  if (existsSync(path)) {
    before = readFileSync(path, "utf8");
    try {
      existing = JSON.parse(before) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  const next: Record<string, unknown> = {
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
    if (ids.length > 0) next["agents"] = ids;
    else delete next["agents"];
  }
  const serialized = `${JSON.stringify(next, undefined, 2)}\n`;
  const changed = before !== serialized;
  if (changed && !dryRun) {
    writeFileSync(path, serialized, "utf8");

    // Read it back rather than trust the write. The path came from `git
    // rev-parse`, which does not always spell it the way this platform reads
    // it, and a write can also be undone by permissions or a file watcher. A
    // selection that silently failed to land looks exactly like a command that
    // did nothing, which is impossible to report and no fun to debug.
    const landed = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    if (landed !== serialized) {
      throw new Error(
        `wrote ${path} but reading it back did not return what was written. ` +
          `Check that the path is writable and is the file you expect.`
      );
    }
  }
  return { path, changed };
}
