import { existsSync } from "node:fs";
import { join } from "node:path";

import { mergeServer, readConfig, removeServer, writeConfig } from "../mcp-config.mjs";

export const SERVER_NAME = "jitera";
const CONFIG_KEY = "mcpServers";
const API_KEY_ENV = "JITERA_API_KEY";

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
    return scope === "user"
      ? [join(home, ".agents", "skills"), join(home, ".claude", "skills")]
      : [join(cwd, ".agents", "skills"), join(cwd, ".claude", "skills")];
  },

  serverEntry({ mcpUrl }) {
    return {
      type: "http",
      url: mcpUrl,
      headers: {
        Authorization: `Bearer \${env:${API_KEY_ENV}}`,
      },
    };
  },

  install({ scope, home, cwd, mcpUrl, dryRun }) {
    const path = this.mcpConfigPath({ scope, home, cwd });
    const before = readConfig(path);
    const after = mergeServer(before, CONFIG_KEY, SERVER_NAME, this.serverEntry({ mcpUrl }));
    if (!dryRun) writeConfig(path, after);
    return { path, config: after, changed: JSON.stringify(before) !== JSON.stringify(after) };
  },

  uninstall({ scope, home, cwd, dryRun }) {
    const path = this.mcpConfigPath({ scope, home, cwd });
    const before = readConfig(path);
    const after = removeServer(before, CONFIG_KEY, SERVER_NAME);
    if (!dryRun) writeConfig(path, after);
    return { path, config: after, changed: JSON.stringify(before) !== JSON.stringify(after) };
  },
};
