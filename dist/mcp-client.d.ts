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
    readonly error?: {
        readonly code?: number;
        readonly message?: string;
    };
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
export declare class McpCallError extends Error {
    readonly name = "McpCallError";
    readonly detail: unknown;
    constructor(message: string, detail?: unknown);
}
export declare function parseBody(contentType: string, raw: string): JsonRpcResponse | undefined;
export declare function extractText(result: ToolResult | undefined): string;
export interface TransportOptions {
    readonly url: string;
    readonly apiKey: string;
    readonly timeoutMs?: number;
    readonly projectUuid?: string | undefined;
}
export declare function postRpc(request: JsonRpcRequest, { url, apiKey, timeoutMs, projectUuid }: TransportOptions): Promise<JsonRpcResponse | undefined>;
export interface CallToolOptions extends TransportOptions {
    readonly name: string;
    readonly args?: Record<string, unknown>;
}
export declare function callTool({ name, args, ...transport }: CallToolOptions): Promise<string>;
//# sourceMappingURL=mcp-client.d.ts.map