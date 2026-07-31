import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensureRootKey, removeTable, upsertTable } from "../toml-section.js";
export const SERVER_TABLE = "mcp_servers.jitera";
const RMCP_FLAG = "experimental_use_rmcp_client";
const API_KEY_ENV = "JITERA_API_KEY";
function read(path) {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
}
function write(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
}
export const codex = {
    id: "codex",
    label: "Codex",
    secretStrategy: "env",
    detect({ home }) {
        return existsSync(join(home, ".codex"));
    },
    mcpConfigPath({ home }) {
        return join(home, ".codex", "config.toml");
    },
    skillsDirs({ scope, home, cwd }) {
        const root = scope === "user" ? home : cwd;
        return [join(root, ".agents", "skills")];
    },
    install(context) {
        const path = this.mcpConfigPath(context);
        const before = read(path);
        const body = [
            `url = "${context.mcpUrl ?? ""}"`,
            context.apiKey
                ? `bearer_token = "${context.apiKey}"`
                : `bearer_token_env_var = "${API_KEY_ENV}"`,
        ].join("\n");
        const after = ensureRootKey(upsertTable(before, SERVER_TABLE, body), RMCP_FLAG, "true");
        if (!context.dryRun)
            write(path, after);
        return { path, config: {}, changed: before !== after };
    },
    uninstall(context) {
        const path = this.mcpConfigPath(context);
        const before = read(path);
        const after = removeTable(before, SERVER_TABLE);
        if (!context.dryRun && before !== after)
            write(path, after);
        return { path, config: {}, changed: before !== after };
    },
};
//# sourceMappingURL=codex.js.map