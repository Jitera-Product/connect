#!/usr/bin/env node
import { callTool, McpCallError } from "../mcp-client.js";
import { discoverDeployment } from "../discovery.js";
import { emitContext, promptText, readHookInput } from "../hook-io.js";
import { readProjectMarker } from "../project-marker.js";
import { claimOnce } from "../session-marker.js";
import { writeSessionStatus } from "../session-status.js";
const MAX_CONTEXT_CHARS = 6000;
// The composite tool searches memory, documents and source concurrently, so it
// is slower than a bare recall. This hook blocks the user's prompt, so the
// ceiling stays close to the old one rather than tracking the server's own
// per-section timeout.
const GATHER_TIMEOUT_MS = 10000;
const RECALL_TIMEOUT_MS = 8000;
// Keywords are extracted from the task, so a pasted stack trace or diff adds
// upload on a path that blocks the prompt without adding signal.
const MAX_TASK_CHARS = 2000;
const input = readHookInput();
const apiKey = process.env["CLAUDE_PLUGIN_OPTION_JITERA_API_KEY"] ?? "";
if (!apiKey)
    process.exit(0);
// Without .jitera.json this repository is not bound to a project, so there is
// no project whose context could be gathered. Bail before discovery rather
// than spend a network round trip guessing at a project nobody chose; session
// start is where the user is told how to bind it.
const marker = readProjectMarker(input.cwd ?? process.cwd());
if (!marker)
    process.exit(0);
// Claimed only once there is something to claim it for: burning the session's
// single gather on an unbound repo would mean running init mid-session never
// took effect.
if (!claimOnce(input.session_id, "recall"))
    process.exit(0);
let url;
const override = process.env["JITERA_MCP_URL"];
if (override) {
    url = override;
}
else {
    try {
        const deployment = await discoverDeployment({
            environment: process.env["CLAUDE_PLUGIN_OPTION_ENVIRONMENT"],
            studioUrl: process.env["JITERA_STUDIO_URL"],
        });
        url = deployment.mcpUrl;
    }
    catch (error) {
        process.stderr.write(`jitera-connect: ${error.message}\n`);
        process.exit(0);
    }
}
const transport = { url, apiKey, projectUuid: marker.project };
const task = promptText(input).slice(0, MAX_TASK_CHARS);
// The blind recall serves two purposes: it is what deployments predating the
// composite tool answer, and it is the right call when there is no prompt text
// to gather for. It stays query-less on purpose — a server without the widening
// ladder can return less for a query than for no query.
const recall = () => callTool({
    ...transport,
    name: "recall_jitera_memory",
    args: {},
    timeoutMs: RECALL_TIMEOUT_MS,
});
// The fallback exists for deployments that predate the composite tool, so it
// is worth a second round trip only when the tool is genuinely absent. Falling
// back on a timeout would stack RECALL_TIMEOUT_MS on top of GATHER_TIMEOUT_MS
// while the user's prompt is blocked.
function toolIsMissing(error) {
    if (!(error instanceof McpCallError))
        return false;
    const detail = error.detail;
    if (detail?.code === -32601 || detail?.code === -32602)
        return true;
    return /unknown tool|tool not found|method not found/i.test(error.message);
}
function giveUp(error) {
    const message = error instanceof McpCallError ? error.message : String(error);
    writeSessionStatus(input.session_id, { recallError: message });
    process.stderr.write(`jitera-connect: could not load project context: ${message}\n`);
    process.exit(0);
}
let memory;
const startedAt = Date.now();
try {
    // Gathering for an empty task makes the server ask for one, and that answer
    // would be injected as though it were project context.
    memory = task
        ? await callTool({
            ...transport,
            name: "gather_jitera_context",
            args: { task, budget: MAX_CONTEXT_CHARS },
            timeoutMs: GATHER_TIMEOUT_MS,
        })
        : await recall();
}
catch (gatherError) {
    if (!task || !toolIsMissing(gatherError))
        giveUp(gatherError);
    try {
        memory = await recall();
    }
    catch (error) {
        giveUp(error);
    }
}
writeSessionStatus(input.session_id, {
    recallMs: Date.now() - startedAt,
    recallChars: memory.length,
    recallError: undefined,
});
if (!memory)
    process.exit(0);
const body = memory.length > MAX_CONTEXT_CHARS
    ? `${memory.slice(0, MAX_CONTEXT_CHARS)}\n\n[truncated, call gather_jitera_context for the rest]`
    : memory;
emitContext("UserPromptSubmit", `Project context for this workspace, gathered at session start:\n\n${body}\n\n` +
    `Treat this as current. It was gathered for the first prompt of this session, so call ` +
    `gather_jitera_context yourself when the task moves on to a different area, and persist ` +
    `new decisions with remember_jitera_memory.`);
//# sourceMappingURL=user-prompt-submit.js.map