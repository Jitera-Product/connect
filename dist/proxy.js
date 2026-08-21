import { createInterface } from "node:readline";
import { discoverDeployment } from "./discovery.js";
import { DEFAULT_BRAND } from "./install/render.js";
import { McpCallError, postRpc } from "./mcp-client.js";
import { readProjectMarker } from "./project-marker.js";
const REQUEST_TIMEOUT_MS = 30_000;
// The repository's committed .jitera.json binds the workspace to a project;
// an explicit JITERA_PROJECT env always wins.
export function resolveProjectUuid(env, cwd = process.cwd()) {
    const override = (env["JITERA_PROJECT"] ?? "").trim();
    if (override)
        return override;
    return readProjectMarker(cwd)?.project;
}
export function resolveAgents(cwd, env = process.env) {
    // JITERA_PROJECT overrides which project the proxy talks to, and agent ids
    // belong to the project they were chosen in. Sending this repository's ids
    // alongside someone else's project matches nothing and quietly empties the
    // recall, so the override drops the selection with it.
    if (env["JITERA_PROJECT"])
        return undefined;
    const agents = readProjectMarker(cwd)?.agents;
    return agents && agents.length > 0 ? agents : undefined;
}
// Tools whose reach `set-agent` narrows. Clients other than Claude Code reach
// the server through this proxy, so the repository's choice is applied here
// rather than relying on every client to know about it.
const AGENT_SCOPED_TOOLS = new Set(["recall_jitera_memory", "gather_jitera_context"]);
export function withAgentSelection(request, agents) {
    if (!agents || agents.length === 0 || request.method !== "tools/call")
        return request;
    const params = request.params;
    if (!params?.name || !AGENT_SCOPED_TOOLS.has(params.name))
        return request;
    // A caller that named agents itself has been more specific than the
    // repository default, so leave it alone.
    const args = params.arguments;
    if (args !== undefined && (typeof args !== "object" || Array.isArray(args))) {
        // Not a valid MCP argument object; forwarding it unchanged lets the server
        // reject it rather than this throwing on a property test.
        return request;
    }
    if (args && "agents" in args)
        return request;
    return {
        ...request,
        params: { ...params, arguments: { ...(args ?? {}), agents: [...agents] } },
    };
}
function isNotification(request) {
    return request.id === undefined || request.id === null;
}
function errorResponse(id, code, message) {
    return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}
function injectInstructions(response, instructions) {
    const result = response?.result;
    if (result && typeof result === "object" && !result["instructions"]) {
        result["instructions"] = instructions;
    }
}
export async function runProxy({ url, apiKey, instructions, projectUuid, agents }, { input, output, log }) {
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        let request;
        try {
            request = JSON.parse(trimmed);
        }
        catch {
            log.write(`jitera-connect proxy: ignoring unparseable line\n`);
            continue;
        }
        let response;
        try {
            response = await postRpc(withAgentSelection(request, agents), {
                url,
                apiKey,
                projectUuid,
                timeoutMs: REQUEST_TIMEOUT_MS,
            });
        }
        catch (error) {
            const message = error instanceof McpCallError ? error.message : String(error);
            log.write(`jitera-connect proxy: ${message}\n`);
            if (!isNotification(request)) {
                output.write(`${errorResponse(request.id, -32603, message)}\n`);
            }
            continue;
        }
        if (request.method === "initialize" && instructions) {
            injectInstructions(response, instructions);
        }
        if (!isNotification(request) && response) {
            output.write(`${JSON.stringify(response)}\n`);
        }
    }
}
export async function configFromEnvironment(env) {
    const apiKey = env["JITERA_API_KEY"] ?? "";
    const override = env["JITERA_MCP_URL"] ?? "";
    if (override)
        return { url: override, apiKey, brand: DEFAULT_BRAND };
    const environment = env["JITERA_ENVIRONMENT"] ?? "";
    const deployment = await discoverDeployment({
        environment,
        studioUrl: env["JITERA_STUDIO_URL"],
    });
    return { url: deployment.mcpUrl, apiKey, brand: deployment.brand };
}
//# sourceMappingURL=proxy.js.map