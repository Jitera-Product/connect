import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const NAMESPACE = "jitera-connect";
export function markerPath(sessionId, kind, root = tmpdir()) {
    const digest = createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
    return join(root, NAMESPACE, `${kind}-${digest}`);
}
export function claimOnce(sessionId, kind, root = tmpdir()) {
    if (!sessionId)
        return false;
    const path = markerPath(sessionId, kind, root);
    if (existsSync(path))
        return false;
    try {
        mkdirSync(join(root, NAMESPACE), { recursive: true });
        writeFileSync(path, "", { flag: "wx" });
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=session-marker.js.map