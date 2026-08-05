#!/usr/bin/env node
import { callTool, McpCallError } from "../mcp-client.ts";
import { discoverDeployment } from "../discovery.ts";
import { emitContext, readHookInput } from "../hook-io.ts";
import { readProjectMarker } from "../project-marker.ts";
import { claimOnce } from "../session-marker.ts";
import { writeSessionStatus } from "../session-status.ts";

const MAX_CONTEXT_CHARS = 6000;
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

let memory: string;
const startedAt = Date.now();
try {
  memory = await callTool({
    url,
    apiKey,
    projectUuid: readProjectMarker(input.cwd ?? process.cwd())?.project,
    name: "recall_jitera_memory",
    args: {},
    timeoutMs: RECALL_TIMEOUT_MS,
  });
} catch (error) {
  const message = error instanceof McpCallError ? error.message : String(error);
  writeSessionStatus(input.session_id, { recallError: message });
  process.stderr.write(`jitera-connect: could not load project memory: ${message}\n`);
  process.exit(0);
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
  `Stored project memory for this workspace, loaded at session start:\n\n${body}\n\n` +
    `Treat this as current. Call recall_jitera_memory again if you need a narrower or fuller view, ` +
    `and persist new decisions with remember_jitera_memory.`
);
