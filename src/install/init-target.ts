import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { parse, resolve } from "node:path";

// Where `init` writes. The directory it was run in is the intent: a subfolder
// of a monorepo is a real place to bind a project, and the repository root is
// offered rather than assumed. Two places are never a target - the home
// directory and the filesystem root - because a CLAUDE.md there applies to
// every project beneath it, and that was exactly how a binding meant for one
// repo ended up governing all of them.
export type InitTarget =
  | { readonly kind: "write"; readonly dir: string; readonly repoRoot?: string }
  | { readonly kind: "refuse"; readonly reason: string };

export const NOT_A_REPOSITORY =
  "not inside a git repository. Instructions written outside a repository are " +
  "invisible to assistants that read AGENTS.md from the repository root, and an " +
  "out-of-repo CLAUDE.md leaks into every project below it. Run this from inside " +
  "the repository you want to connect.";

export function broadDirectoryReason(dir: string): string {
  return (
    `refusing to write to ${dir}: a CLAUDE.md there would apply to every project ` +
    "beneath it. Run init inside the project you want to connect."
  );
}

function sameDirectory(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

export function isBroadDirectory(dir: string, home: string = homedir()): boolean {
  const full = resolve(dir);
  return sameDirectory(full, home) || parse(full).root === full;
}

export function chooseInitTarget({
  cwd,
  gitRoot,
  home = homedir(),
}: {
  readonly cwd: string;
  readonly gitRoot: string | undefined;
  readonly home?: string;
}): InitTarget {
  if (!gitRoot) return { kind: "refuse", reason: NOT_A_REPOSITORY };
  if (isBroadDirectory(cwd, home)) return { kind: "refuse", reason: broadDirectoryReason(cwd) };
  if (sameDirectory(cwd, gitRoot)) return { kind: "write", dir: cwd };
  return { kind: "write", dir: cwd, repoRoot: gitRoot };
}
