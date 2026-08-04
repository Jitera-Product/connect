import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MARKER_FILENAME = ".jitera.json";

// Environments are studio, studio-stage, studio-NN. Anything else in the file
// is not echoed back into session context.
const SAFE_ENVIRONMENT = /^[A-Za-z0-9-]{1,64}$/;

export interface ProjectMarker {
  readonly environment?: string | undefined;
  readonly project?: string | undefined;
}

export interface FoundProjectMarker extends ProjectMarker {
  readonly path: string;
}

export function readProjectMarker(startDir: string): FoundProjectMarker | undefined {
  let dir = startDir;
  for (;;) {
    const path = join(dir, MARKER_FILENAME);
    if (existsSync(path)) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      } catch {
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

  const next = {
    ...existing,
    ...(marker.environment ? { environment: marker.environment } : {}),
    ...(marker.project ? { project: marker.project } : {}),
  };
  const serialized = `${JSON.stringify(next, undefined, 2)}\n`;
  const changed = before !== serialized;
  if (changed && !dryRun) writeFileSync(path, serialized, "utf8");
  return { path, changed };
}
