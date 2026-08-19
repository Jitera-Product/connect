#!/usr/bin/env node
import { callTool, McpCallError } from "../mcp-client.ts";
import { discoverDeployment } from "../discovery.ts";
import { emitContext, promptText, readHookInput } from "../hook-io.ts";
import { readProjectMarker } from "../project-marker.ts";
import { claimOnce } from "../session-marker.ts";
import { writeSessionStatus } from "../session-status.ts";

const MAX_CONTEXT_CHARS = 6000;
// The composite tool searches memory, documents and source concurrently, so it
// is slower than a bare recall. This hook blocks the user's prompt, so the
// ceiling stays close to the old one rather than tracking the server's own
// per-section timeout.
const GATHER_TIMEOUT_MS = 10000;
const RECALL_TIMEOUT_MS = 8000;

const input = readHookInput();

if (!claimOnce(input.session_id, "recall")) process.exit(0);

const apiKey = process.env["CLAUDE_PLUGIN_OPTION_JITERA_API_KEY"] ?? "";
if (!apiKey) process.exit(0);

let url: string;
const override = process.env["JITERA_MCP_URL"];
if (override) {
  url = override;
} else {
  try {
    const deployment = await discoverDeployment({
      environment: process.env["CLAUDE_PLUGIN_OPTION_ENVIRONMENT"],
      studioUrl: process.env["JITERA_STUDIO_URL"],
    });
    url = deployment.mcpUrl;
  } catch (error) {
    process.stderr.write(`jitera-connect: ${(error as Error).message}\n`);
    process.exit(0);
  }
}

const transport = {
  url,
  apiKey,
  projectUuid: readProjectMarker(input.cwd ?? process.cwd())?.project,
};

const task = promptText(input);

let memory: string;
const startedAt = Date.now();
try {
  memory = await callTool({
    ...transport,
    name: "gather_jitera_context",
    args: { task, budget: MAX_CONTEXT_CHARS },
    timeoutMs: GATHER_TIMEOUT_MS,
  });
} catch (gatherError) {
  // Deployments predating the composite tool still answer the plain recall.
  // The blind call is kept verbatim there: filtering by query on a server
  // without the widening ladder can return less than no query at all.
  try {
    memory = await callTool({
      ...transport,
      name: "recall_jitera_memory",
      args: {},
      timeoutMs: RECALL_TIMEOUT_MS,
    });
  } catch (error) {
    const message = error instanceof McpCallError ? error.message : String(error);
    writeSessionStatus(input.session_id, { recallError: message });
    process.stderr.write(`jitera-connect: could not load project context: ${message}\n`);
    process.exit(0);
  }
}

writeSessionStatus(input.session_id, {
  recallMs: Date.now() - startedAt,
  recallChars: memory.length,
  recallError: undefined,
});

if (!memory) process.exit(0);

const body =
  memory.length > MAX_CONTEXT_CHARS
    ? `${memory.slice(0, MAX_CONTEXT_CHARS)}\n\n[truncated, call recall_jitera_memory for the rest]`
    : memory;

emitContext(
  "UserPromptSubmit",
  `Project context for this workspace, gathered at session start:\n\n${body}\n\n` +
    `Treat this as current. It was gathered for the first prompt of this session, so call ` +
    `gather_jitera_context yourself when the task moves on to a different area, and persist ` +
    `new decisions with remember_jitera_memory.`
);
