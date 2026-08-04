import { createInterface } from "node:readline";
import { discoverDeployment } from "./discovery.js";
import { DEFAULT_BRAND } from "./install/render.js";
import { McpCallError, postRpc } from "./mcp-client.js";
const REQUEST_TIMEOUT_MS = 30_000;
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
export async function runProxy({ url, apiKey, instructions }, { input, output, log }) {
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
            response = await postRpc(request, { url, apiKey, timeoutMs: REQUEST_TIMEOUT_MS });
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