import { join } from "node:path";
import { MalformedConfigError, readConfig, writeConfig } from "../mcp-config.js";
// Resolves the newest installed plugin version at run time, so plugin updates
// never orphan the status line, and exits quietly if the plugin is gone.
export const STATUS_COMMAND = '_j="$(ls -dt "$HOME/.claude/plugins/cache/jitera/jitera-connect/"*"/dist/bin/statusline.js" 2>/dev/null | head -1)"; ' +
    '[ -n "$_j" ] && exec node "$_j" || true';
export function installStatusLine({ home, dryRun = false, }) {
    const path = join(home, ".claude", "settings.json");
    let config;
    try {
        config = readConfig(path);
    }
    catch (error) {
        if (error instanceof MalformedConfigError) {
            return { installed: false, reason: error.message, path };
        }
        throw error;
    }
    // The status line is a single global slot. Someone else's configuration is
    // theirs; report why we stepped back instead of silently clobbering it.
    const existing = config["statusLine"];
    if (existing && existing.command !== STATUS_COMMAND) {
        return { installed: false, reason: "a status line is already configured", path };
    }
    if (!existing && !dryRun) {
        writeConfig(path, { ...config, statusLine: { type: "command", command: STATUS_COMMAND } });
    }
    return { installed: true, path };
}
//# sourceMappingURL=statusline.js.map