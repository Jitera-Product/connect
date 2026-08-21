import { type JsonRpcRequest } from "./mcp-client.ts";
export interface ProxyStreams {
    readonly input: NodeJS.ReadableStream;
    readonly output: NodeJS.WritableStream;
    readonly log: NodeJS.WritableStream;
}
export interface ProxyConfig {
    readonly url: string;
    readonly apiKey: string;
    readonly instructions?: string | undefined;
    readonly projectUuid?: string | undefined;
    readonly agents?: readonly string[] | undefined;
}
export declare function resolveProjectUuid(env: NodeJS.ProcessEnv, cwd?: string): string | undefined;
export declare function resolveAgents(cwd: string, env?: NodeJS.ProcessEnv): readonly string[] | undefined;
export declare function withAgentSelection(request: JsonRpcRequest, agents: readonly string[] | undefined): JsonRpcRequest;
export declare function runProxy({ url, apiKey, instructions, projectUuid, agents }: ProxyConfig, { input, output, log }: ProxyStreams): Promise<void>;
export interface ProxyEnvironment extends ProxyConfig {
    readonly brand: string;
}
export declare function configFromEnvironment(env: NodeJS.ProcessEnv): Promise<ProxyEnvironment>;
//# sourceMappingURL=proxy.d.ts.map