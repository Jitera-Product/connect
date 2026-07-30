#!/usr/bin/env node
import { callTool, McpCallError } from "../mcp-client.js";
import { resolveMcpUrl, UnknownEnvironmentError } from "../environments.js";
import { emitContext, readHookInput } from "../hook-io.js";
import { claimOnce } from "../session-marker.js";
const MAX_CONTEXT_CHARS = 6000;
const RECALL_TIMEOUT_MS = 8000;
const input = readHookInput();
if (!claimOnce(input.session_id, "recall"))
    process.exit(0);
const apiKey = process.env["CLAUDE_PLUGIN_OPTION_JITERA_API_KEY"] ?? "";
if (!apiKey)
    process.exit(0);
let url;
try {
    url =
        process.env["JITERA_MCP_URL"] ??
            resolveMcpUrl(process.env["CLAUDE_PLUGIN_OPTION_ENVIRONMENT"]);
}
catch (error) {
    const message = error instanceof UnknownEnvironmentError ? error.message : String(error);
    process.stderr.write(`jitera-connect: ${message}\n`);
    process.exit(0);
}
let memory;
try {
    memory = await callTool({
        url,
        apiKey,
        name: "recall_jitera_memory",
        args: {},
        timeoutMs: RECALL_TIMEOUT_MS,
    });
}
catch (error) {
    const message = error instanceof McpCallError ? error.message : String(error);
    process.stderr.write(`jitera-connect: could not load project memory: ${message}\n`);
    process.exit(0);
}
if (!memory)
    process.exit(0);
const body = memory.length > MAX_CONTEXT_CHARS
    ? `${memory.slice(0, MAX_CONTEXT_CHARS)}\n\n[truncated, call recall_jitera_memory for the rest]`
    : memory;
emitContext("UserPromptSubmit", `Stored project memory for this workspace, loaded at session start:\n\n${body}\n\n` +
    `Treat this as current. Call recall_jitera_memory again if you need a narrower or fuller view, ` +
    `and persist new decisions with remember_jitera_memory.`);
//# sourceMappingURL=user-prompt-submit.js.map