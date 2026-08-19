#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { emitContext, readHookInput } from "../hook-io.ts";
import { readProjectMarker } from "../project-marker.ts";
import { writeSessionStatus } from "../session-status.ts";

const CONTENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "content");

const input = readHookInput();

// Claude Code exports plugin userConfig to hooks as CLAUDE_PLUGIN_OPTION_<KEY>.
// Without a key the mcp server cannot start, so claiming the tools exist would
// teach the model to call tools that are not there.
const apiKey = (process.env["CLAUDE_PLUGIN_OPTION_JITERA_API_KEY"] ?? "").trim();
const configuredEnvironment = (process.env["CLAUDE_PLUGIN_OPTION_ENVIRONMENT"] ?? "").trim();
// A committed .jitera.json binds the repository to a deployment and project.
// Read it first: which directive applies depends on whether this repo is bound.
const marker = readProjectMarker(input.cwd ?? process.cwd());

// Three states, because "connected" and "bound to a project" are different
// things: without a binding the tools would have no project to read.
const file = !apiKey
  ? "session-start-unconfigured.md"
  : marker
    ? "session-start.md"
    : "session-start-unbound.md";

let directive: string;
try {
  directive = readFileSync(join(CONTENT_ROOT, file), "utf8").trim();
} catch {
  process.exit(0);
}

writeSessionStatus(input.session_id, {
  configured: Boolean(apiKey),
  environment: configuredEnvironment || "studio",
});

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

// `init` writes a marker with no project when nobody was signed in to pick one.
// A project-scoped key still works, but a user-level key cannot infer a project
// and every call quietly fails, so name the gap rather than let it dead-end.
if (apiKey && marker && !marker.project) {
  directive +=
    `\n\nNote: this repository's .jitera.json records no project. A user-level ` +
    `API key cannot infer one, so project context may not load. Suggest finishing ` +
    `the binding with:\n\n    npx @jitera/connect init --project=<uuid>`;
}

emitContext("SessionStart", directive);
