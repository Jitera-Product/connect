import { spawnSync } from "node:child_process";

export function resolveGitRoot(cwd: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.status !== 0) return undefined;
  const root = result.stdout.trim();
  return root || undefined;
}
