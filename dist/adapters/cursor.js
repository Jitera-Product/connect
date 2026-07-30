import { existsSync } from "node:fs";
import { join } from "node:path";
import { mergeServer, readConfig, removeServer, writeConfig, } from "../mcp-config.js";
export const SERVER_NAME = "jitera";
const CONFIG_KEY = "mcpServers";
const API_KEY_ENV = "JITERA_API_KEY";
function serverEntry(mcpUrl) {
    return {
        type: "http",
        url: mcpUrl,
        headers: { Authorization: `Bearer \${env:${API_KEY_ENV}}` },
    };
}
export const cursor = {
    id: "cursor",
    label: "Cursor",
    secretStrategy: "env",
    detect({ home }) {
        return existsSync(join(home, ".cursor"));
    },
    mcpConfigPath({ scope, home, cwd }) {
        return scope === "user"
            ? join(home, ".cursor", "mcp.json")
            : join(cwd, ".cursor", "mcp.json");
    },
    skillsDirs({ scope, home, cwd }) {
        const root = scope === "user" ? home : cwd;
        return [join(root, ".agents", "skills"), join(root, ".claude", "skills")];
    },
    install(context) {
        const path = this.mcpConfigPath(context);
        const before = readConfig(path);
        const after = mergeServer(before, CONFIG_KEY, SERVER_NAME, serverEntry(context.mcpUrl ?? ""));
        if (!context.dryRun)
            writeConfig(path, after);
        return { path, config: after, changed: JSON.stringify(before) !== JSON.stringify(after) };
    },
    uninstall(context) {
        const path = this.mcpConfigPath(context);
        const before = readConfig(path);
        const after = removeServer(before, CONFIG_KEY, SERVER_NAME);
        if (!context.dryRun)
            writeConfig(path, after);
        return { path, config: after, changed: JSON.stringify(before) !== JSON.stringify(after) };
    },
};
//# sourceMappingURL=cursor.js.map