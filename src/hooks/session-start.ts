#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { emitContext, readHookInput } from "../hook-io.ts";
import { readProjectMarker } from "../project-marker.ts";

const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content");

const input = readHookInput();

// Claude Code exports plugin userConfig to hooks as CLAUDE_PLUGIN_OPTION_<KEY>.
// Without a key the mcp server cannot start, so claiming the tools exist would
// teach the model to call tools that are not there.
const apiKey = (process.env["CLAUDE_PLUGIN_OPTION_JITERA_API_KEY"] ?? "").trim();
const configuredEnvironment = (process.env["CLAUDE_PLUGIN_OPTION_ENVIRONMENT"] ?? "").trim();
const file = apiKey ? "session-start.md" : "session-start-unconfigured.md";

let directive: string;
try {
  directive = readFileSync(join(CONTENT_ROOT, file), "utf8").trim();
} catch {
  process.exit(0);
}

// A committed .jitera.json binds the repository to a deployment, so teammates
// who have not connected yet get the exact command, and a mismatched plugin
// configuration is called out instead of silently reading the wrong project.
const marker = readProjectMarker(input.cwd ?? process.cwd());
if (marker?.environment) {
  const login = `npx @jitera/connect login --env=${marker.environment} --install`;
  if (!apiKey) {
    directive +=
      `\n\nThis repository declares its connection in .jitera.json ` +
      `(environment "${marker.environment}"). Suggest the user connects with:\n\n    ${login}`;
  } else if (configuredEnvironment && configuredEnvironment !== marker.environment) {
    directive +=
      `\n\nNote: this repository's .jitera.json declares environment ` +
      `"${marker.environment}", but the plugin is configured for "${configuredEnvironment}". ` +
      `Project context may come from the wrong deployment. Suggest rebinding with:\n\n    ${login}`;
  }
}

emitContext("SessionStart", directive);
