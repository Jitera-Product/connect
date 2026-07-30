export interface UserConfigOption {
    readonly type: "string" | "number" | "boolean" | "directory" | "file";
    readonly title: string;
    readonly description: string;
    readonly sensitive?: boolean;
    readonly required?: boolean;
    readonly default?: string;
}
export interface StdioServer {
    readonly command: string;
    readonly args: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    readonly url?: never;
}
export interface HttpServer {
    readonly type: "http" | "sse" | "ws";
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly command?: never;
}
export type McpServer = StdioServer | HttpServer;
export interface PluginManifest {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly author?: {
        readonly name: string;
    };
    readonly hooks?: string;
    readonly skills?: string | readonly string[];
    readonly mcpServers?: Readonly<Record<string, McpServer>>;
    readonly userConfig?: Readonly<Record<string, UserConfigOption>>;
}
export interface MarketplaceEntry {
    readonly name: string;
    readonly source: string;
    readonly description?: string;
}
export interface MarketplaceManifest {
    readonly name: string;
    readonly description?: string;
    readonly owner?: {
        readonly name: string;
    };
    readonly plugins: readonly MarketplaceEntry[];
}
export interface HookCommand {
    readonly type: "command" | "mcp_tool" | "http" | "prompt" | "agent";
    readonly command?: string;
    readonly args?: readonly string[];
    readonly timeout?: number;
    readonly statusMessage?: string;
}
export interface HookMatcher {
    readonly matcher?: string;
    readonly hooks: readonly HookCommand[];
}
export interface HooksFile {
    readonly hooks: Readonly<Record<string, readonly HookMatcher[]>>;
}
export declare function readJsonFile<T>(path: string): T;
//# sourceMappingURL=manifest.d.ts.map