import { resolveStudioUrl } from "./environments.js";
export const DISCOVERY_PATHS = ["/p/jitera-connect.json", "/jitera-connect.json"];
export class DiscoveryError extends Error {
    name = "DiscoveryError";
    studioUrl;
    attempts;
    constructor(studioUrl, attempts, reason) {
        super(`could not read the deployment configuration from ${studioUrl} (${reason}). ` +
            `Tried: ${attempts.join(", ")}. ` +
            `Check the environment name, or pass --mcp-url to bypass discovery.`);
        this.studioUrl = studioUrl;
        this.attempts = attempts;
    }
}
function isUsable(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const candidate = value;
    return typeof candidate["mcpUrl"] === "string" && candidate["mcpUrl"].startsWith("http");
}
export async function discoverDeployment({ environment, studioUrl: studioOverride, timeoutMs = 8000, fetchImpl = fetch, } = {}) {
    const studioUrl = (studioOverride ?? "").replace(/\/$/, "") || resolveStudioUrl(environment);
    const attempts = [];
    let lastReason = "no response";
    for (const path of DISCOVERY_PATHS) {
        const url = `${studioUrl}${path}`;
        attempts.push(url);
        try {
            const response = await fetchImpl(url, {
                signal: AbortSignal.timeout(timeoutMs),
                headers: { accept: "application/json" },
            });
            if (!response.ok) {
                lastReason = `HTTP ${response.status}`;
                continue;
            }
            const payload = await response.json();
            if (!isUsable(payload)) {
                lastReason = "the response did not contain an mcpUrl";
                continue;
            }
            return {
                mcpUrl: payload.mcpUrl,
                apiBaseUrl: typeof payload.apiBaseUrl === "string" ? payload.apiBaseUrl : "",
                brand: typeof payload.brand === "string" && payload.brand ? payload.brand : "Jitera",
            };
        }
        catch (error) {
            const cause = error;
            lastReason =
                cause.name === "TimeoutError" ? `timed out after ${timeoutMs}ms` : cause.message;
        }
    }
    throw new DiscoveryError(studioUrl, attempts, lastReason);
}
//# sourceMappingURL=discovery.js.map