import type { ClientConfig } from "../mcp-config.ts";
export type Scope = "project" | "user";
export interface AdapterContext {
    readonly scope: Scope;
    readonly home: string;
    readonly cwd: string;
    readonly mcpUrl?: string;
    readonly dryRun?: boolean;
}
export interface AdapterResult {
    readonly path: string;
    readonly config: ClientConfig;
    readonly changed: boolean;
}
export interface Adapter {
    readonly id: string;
    readonly label: string;
    readonly secretStrategy: "keychain" | "env" | "inline";
    detect(context: Pick<AdapterContext, "home">): boolean;
    mcpConfigPath(context: AdapterContext): string;
    skillsDirs(context: AdapterContext): readonly string[];
    install(context: AdapterContext): AdapterResult;
    uninstall(context: AdapterContext): AdapterResult;
}
//# sourceMappingURL=types.d.ts.map