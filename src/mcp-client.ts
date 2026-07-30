export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: string | number;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id?: string | number;
  readonly result?: ToolResult;
  readonly error?: { readonly code?: number; readonly message?: string };
}

export interface ToolResult {
  readonly content?: readonly ContentPart[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

export interface ContentPart {
  readonly type: string;
  readonly text?: string;
}

export class McpCallError extends Error {
  override readonly name = "McpCallError";
  readonly detail: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.detail = detail;
  }
}

export function parseBody(contentType: string, raw: string): JsonRpcResponse | undefined {
  if (raw.trim() === "") return undefined;
  if (contentType.includes("text/event-stream")) {
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload) return JSON.parse(payload) as JsonRpcResponse;
    }
    throw new McpCallError("event stream carried no data frame", raw.slice(0, 200));
  }
  return JSON.parse(raw) as JsonRpcResponse;
}

export function extractText(result: ToolResult | undefined): string {
  return (result?.content ?? [])
    .filter((part): part is ContentPart & { text: string } =>
      part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export interface TransportOptions {
  readonly url: string;
  readonly apiKey: string;
  readonly timeoutMs?: number;
}

export async function postRpc(
  request: JsonRpcRequest,
  { url, apiKey, timeoutMs = 5000 }: TransportOptions
): Promise<JsonRpcResponse | undefined> {
  if (!url) throw new McpCallError("no mcp endpoint configured");
  if (!apiKey) throw new McpCallError("no api key configured");

  const label = request.method === "tools/call"
    ? (request.params as { name?: string } | undefined)?.name ?? request.method
    : request.method;

  let response: Response;
  let raw: string;
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
  } catch (error) {
    const cause = error as Error;
    throw new McpCallError(
      cause.name === "TimeoutError" || cause.name === "AbortError"
        ? `${label} timed out after ${timeoutMs}ms`
        : `${label} could not reach ${url}: ${cause.message}`,
      cause
    );
  }

  if (!response.ok) {
    throw new McpCallError(`${label} returned HTTP ${response.status}`, raw.slice(0, 200));
  }

  try {
    return parseBody(response.headers.get("content-type") ?? "", raw);
  } catch (error) {
    if (error instanceof McpCallError) throw error;
    throw new McpCallError(`${label} returned an unreadable body`, (error as Error).message);
  }
}

export interface CallToolOptions extends TransportOptions {
  readonly name: string;
  readonly args?: Record<string, unknown>;
}

export async function callTool({ name, args = {}, ...transport }: CallToolOptions): Promise<string> {
  const payload = await postRpc(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    transport
  );

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
