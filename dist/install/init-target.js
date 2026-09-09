import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { parse, resolve } from "node:path";
export const NOT_A_REPOSITORY = "not inside a git repository. Instructions written outside a repository are " +
    "invisible to assistants that read AGENTS.md from the repository root, and an " +
    "out-of-repo CLAUDE.md leaks into every project below it. Run this from inside " +
    "the repository you want to connect.";
export function broadDirectoryReason(dir) {
    return (`refusing to write to ${dir}: a CLAUDE.md there would apply to every project ` +
        "beneath it. Run init inside the project you want to connect.");
}
function sameDirectory(a, b) {
    try {
        return realpathSync(a) === realpathSync(b);
    }
    catch {
        return resolve(a) === resolve(b);
    }
}
export function isBroadDirectory(dir, home = homedir()) {
    const full = resolve(dir);
    return sameDirectory(full, home) || parse(full).root === full;
}
export function chooseInitTarget({ cwd, gitRoot, home = homedir(), }) {
    if (!gitRoot)
        return { kind: "refuse", reason: NOT_A_REPOSITORY };
    if (isBroadDirectory(cwd, home))
        return { kind: "refuse", reason: broadDirectoryReason(cwd) };
    if (sameDirectory(cwd, gitRoot))
        return { kind: "write", dir: cwd };
    return { kind: "write", dir: cwd, repoRoot: gitRoot };
}
//# sourceMappingURL=init-target.js.map