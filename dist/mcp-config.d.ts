export type ServerEntry = Record<string, unknown>;
export type ClientConfig = Record<string, unknown>;
export declare class MalformedConfigError extends Error {
    readonly name = "MalformedConfigError";
    readonly path: string;
    constructor(path: string, cause: Error);
}
export declare function readConfig(path: string): ClientConfig;
export declare function mergeServer(config: ClientConfig, key: string, name: string, server: ServerEntry): ClientConfig;
export declare function removeServer(config: ClientConfig, key: string, name: string): ClientConfig;
export declare function writeConfig(path: string, config: ClientConfig): void;
//# sourceMappingURL=mcp-config.d.ts.map