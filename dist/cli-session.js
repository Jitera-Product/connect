import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
// Refreshing this close to expiry counts as expired, so a request never starts
// with a token that dies mid-flight.
const EXPIRY_MARGIN_MS = 60_000;
export function sessionPath(env = process.env) {
    const override = env["JITERA_CONNECT_CONFIG_DIR"];
    const dir = override || join(homedir(), ".config", "jitera-connect");
    return join(dir, "session.json");
}
export function saveCliSession(session, env = process.env) {
    const path = sessionPath(env);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${JSON.stringify(session, undefined, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    chmodSync(path, 0o600);
}
export function loadCliSession(env = process.env) {
    const path = sessionPath(env);
    if (!existsSync(path))
        return undefined;
    try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        if (typeof parsed.accessToken !== "string" || typeof parsed.automationUrl !== "string") {
            return undefined;
        }
        return parsed;
    }
    catch {
        return undefined;
    }
}
export function isExpired(session, now = Date.now()) {
    return typeof session.expiresAt === "number" && now >= session.expiresAt - EXPIRY_MARGIN_MS;
}
//# sourceMappingURL=cli-session.js.map