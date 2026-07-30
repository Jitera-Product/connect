export class McpCallError extends Error {
    name = "McpCallError";
    detail;
    constructor(message, detail) {
        super(message);
        this.detail = detail;
    }
}
export function parseBody(contentType, raw) {
    if (raw.trim() === "")
        return undefined;
    if (contentType.includes("text/event-stream")) {
        for (const line of raw.split("\n")) {
            if (!line.startsWith("data:"))
                continue;
            const payload = line.slice(5).trim();
            if (payload)
                return JSON.parse(payload);
        }
        throw new McpCallError("event stream carried no data frame", raw.slice(0, 200));
    }
    return JSON.parse(raw);
}
export function extractText(result) {
    return (result?.content ?? [])
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim();
}
export async function postRpc(request, { url, apiKey, timeoutMs = 5000 }) {
    if (!url)
        throw new McpCallError("no mcp endpoint configured");
    if (!apiKey)
        throw new McpCallError("no api key configured");
    const label = request.method === "tools/call"
        ? request.params?.name ?? request.method
        : request.method;
    let response;
    let raw;
    try {
        response = await fetch(url, {
            method: "POST",
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(request),
        });
        raw = await response.text();
    }
    catch (error) {
        const cause = error;
        throw new McpCallError(cause.name === "TimeoutError" || cause.name === "AbortError"
            ? `${label} timed out after ${timeoutMs}ms`
            : `${label} could not reach ${url}: ${cause.message}`, cause);
    }
    if (!response.ok) {
        throw new McpCallError(`${label} returned HTTP ${response.status}`, raw.slice(0, 200));
    }
    try {
        return parseBody(response.headers.get("content-type") ?? "", raw);
    }
    catch (error) {
        if (error instanceof McpCallError)
            throw error;
        throw new McpCallError(`${label} returned an unreadable body`, error.message);
    }
}
export async function callTool({ name, args = {}, ...transport }) {
    const payload = await postRpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, transport);
    if (!payload) {
        throw new McpCallError(`${name} returned an empty body where a result was required`);
    }
    if (payload.error) {
        throw new McpCallError(`${name} failed: ${payload.error.message ?? "unknown error"}`, payload.error);
    }
    if (payload.result?.isError) {
        throw new McpCallError(`${name} reported failure: ${extractText(payload.result)}`, payload.result);
    }
    return extractText(payload.result);
}
//# sourceMappingURL=mcp-client.js.map