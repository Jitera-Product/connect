export class McpCallError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "McpCallError";
    this.detail = detail;
  }
}

function parseBody(contentType, raw) {
  if (contentType.includes("text/event-stream")) {
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload) return JSON.parse(payload);
      }
    }
    throw new McpCallError("event stream carried no data frame", raw.slice(0, 200));
  }
  return JSON.parse(raw);
}

function extractText(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export async function callTool({ url, apiKey, name, args = {}, timeoutMs = 5000 }) {
  if (!url) throw new McpCallError("no mcp endpoint configured");
  if (!apiKey) throw new McpCallError("no api key configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let raw;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    raw = await response.text();
  } catch (error) {
    throw new McpCallError(
      error.name === "AbortError"
        ? `${name} timed out after ${timeoutMs}ms`
        : `${name} could not reach ${url}: ${error.message}`,
      error
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new McpCallError(`${name} returned HTTP ${response.status}`, raw.slice(0, 200));
  }

  let payload;
  try {
    payload = parseBody(response.headers.get("content-type") ?? "", raw);
  } catch (error) {
    throw new McpCallError(`${name} returned an unreadable body`, error.message);
  }

  if (payload.error) {
    throw new McpCallError(`${name} failed: ${payload.error.message ?? "unknown error"}`, payload.error);
  }
  if (payload.result?.isError) {
    throw new McpCallError(`${name} reported failure: ${extractText(payload.result)}`, payload.result);
  }

  return extractText(payload.result);
}
