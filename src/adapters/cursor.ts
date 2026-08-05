import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Adapter, AdapterContext, AdapterResult } from "./types.ts";
import {
  mergeServer,
  readConfig,
  removeServer,
  writeConfig,
  type ServerEntry,
} from "../mcp-config.ts";

export const SERVER_NAME = "jitera";
const CONFIG_KEY = "mcpServers";
const API_KEY_ENV = "JITERA_API_KEY";

function serverEntry(
  mcpUrl: string,
  apiKey: string | undefined,
  projectUuid: string | undefined
): ServerEntry {
  return {
    type: "http",
    url: mcpUrl,
    headers: {
      Authorization: apiKey ? `Bearer ${apiKey}` : `Bearer \${env:${API_KEY_ENV}}`,
      ...(projectUuid ? { "X-Jitera-Project": projectUuid } : {}),
    },
  };
}

export const cursor: Adapter = {
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
    return [join(root, ".agents", "skills")];
  },

  install(context: AdapterContext): AdapterResult {
    const path = this.mcpConfigPath(context);
    const before = readConfig(path);
    const after = mergeServer(
      before,
      CONFIG_KEY,
      SERVER_NAME,
      serverEntry(context.mcpUrl ?? "", context.apiKey, context.projectUuid)
    );
    if (!context.dryRun) writeConfig(path, after);
    return { path, config: after, changed: JSON.stringify(before) !== JSON.stringify(after) };
  },

  uninstall(context: AdapterContext): AdapterResult {
    const path = this.mcpConfigPath(context);
    const before = readConfig(path);
    const after = removeServer(before, CONFIG_KEY, SERVER_NAME);
    if (!context.dryRun) writeConfig(path, after);
    return { path, config: after, changed: JSON.stringify(before) !== JSON.stringify(after) };
  },
};
