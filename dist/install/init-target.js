import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { parse, resolve } from "node:path";
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
    if (isBroadDirectory(cwd, home))
        return { kind: "refuse", reason: broadDirectoryReason(cwd) };
    if (!gitRoot || sameDirectory(cwd, gitRoot))
        return { kind: "write", dir: cwd };
    return { kind: "write", dir: cwd, repoRoot: gitRoot };
}
//# sourceMappingURL=init-target.js.map