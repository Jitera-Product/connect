import { createInterface } from "node:readline";
import { resolveMcpUrl } from "./environments.js";
import { McpCallError, postRpc } from "./mcp-client.js";
const REQUEST_TIMEOUT_MS = 30_000;
function isNotification(request) {
    return request.id === undefined || request.id === null;
}
function errorResponse(id, code, message) {
    return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}
export async function runProxy({ url, apiKey }, { input, output, log }) {
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
        if (!isNotification(request) && response) {
            output.write(`${JSON.stringify(response)}\n`);
        }
    }
}
export function configFromEnvironment(env) {
    const apiKey = env["JITERA_API_KEY"] ?? "";
    const environment = env["JITERA_ENVIRONMENT"] ?? "";
    const override = env["JITERA_MCP_URL"] ?? "";
    return { url: override || resolveMcpUrl(environment), apiKey };
}
//# sourceMappingURL=proxy.js.map