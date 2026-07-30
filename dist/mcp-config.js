import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
export class MalformedConfigError extends Error {
    name = "MalformedConfigError";
    path;
    constructor(path, cause) {
        super(`${path} exists but is not valid JSON, so it cannot be merged safely. ` +
            `Fix or move the file, then run again. Parser said: ${cause.message}`);
        this.path = path;
    }
}
export function readConfig(path) {
    if (!existsSync(path))
        return {};
    const raw = readFileSync(path, "utf8");
    if (raw.trim() === "")
        return {};
    try {
        return JSON.parse(raw);
    }
    catch (cause) {
        throw new MalformedConfigError(path, cause);
    }
}
export function mergeServer(config, key, name, server) {
    const servers = { ...(config[key] ?? {}) };
    servers[name] = server;
    return { ...config, [key]: servers };
}
export function removeServer(config, key, name) {
    const existing = config[key];
    if (!existing)
        return { ...config };
    const servers = { ...existing };
    delete servers[name];
    const next = { ...config, [key]: servers };
    if (Object.keys(servers).length === 0)
        delete next[key];
    return next;
}
export function writeConfig(path, config) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(config, undefined, 2)}\n`, "utf8");
}
//# sourceMappingURL=mcp-config.js.map