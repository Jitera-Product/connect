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
// A stored sign-in, refreshed if it has aged out. Shared by every command that
// talks to the automation API without sending the user back to the browser.
export async function transportFor(session, refresh, now = Date.now()) {
    if (!isExpired(session, now)) {
        return { automationUrl: session.automationUrl, accessToken: session.accessToken };
    }
    if (!session.refreshToken) {
        throw new Error("the stored sign-in expired. Run login again.");
    }
    const refreshed = await refresh({
        automationUrl: session.automationUrl,
        refreshToken: session.refreshToken,
    });
    saveCliSession({
        ...session,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? session.refreshToken,
        // Without a new expiry, drop the old one rather than keep a timestamp that
        // is already in the past and would force a refresh on every command.
        expiresAt: refreshed.expiresInSeconds
            ? now + refreshed.expiresInSeconds * 1000
            : undefined,
    });
    return { automationUrl: session.automationUrl, accessToken: refreshed.accessToken };
}
//# sourceMappingURL=cli-session.js.map