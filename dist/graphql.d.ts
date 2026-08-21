export declare class GraphqlError extends Error {
    readonly name = "GraphqlError";
    readonly errors: readonly string[];
    constructor(operation: string, errors: readonly string[]);
}
export interface GraphqlTransport {
    readonly automationUrl: string;
    readonly accessToken: string;
    readonly fetchImpl?: typeof fetch;
    readonly timeoutMs?: number;
}
export declare function query<T>(operation: string, document: string, variables: Record<string, unknown>, { automationUrl, accessToken, fetchImpl, timeoutMs }: GraphqlTransport): Promise<T>;
export interface ProjectSummary {
    readonly uuid: string;
    readonly name: string;
    readonly canManageApiKey: boolean;
}
export interface Organisation {
    readonly slug: string;
    readonly name: string | null;
    readonly personal: boolean;
}
export declare function listOrganisations(transport: GraphqlTransport): Promise<Organisation[]>;
export declare function listProjects(transport: GraphqlTransport, organisation?: Organisation): Promise<ProjectSummary[]>;
export interface AgentSummary {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
}
export declare function listAgents(transport: GraphqlTransport, projectUuid: string): Promise<AgentSummary[]>;
export type McpAccess = "read" | "read_write";
export interface CreatedApiKey {
    readonly rawKey: string;
    readonly maskedKey: string;
}
type MutationErrors = string | readonly string[] | null | undefined;
export declare function toErrorMessages(errors: MutationErrors): string[];
export declare function createApiKey(options: {
    readonly projectUuid: string;
    readonly name: string;
    readonly mcpAccess: McpAccess;
}, transport: GraphqlTransport): Promise<CreatedApiKey>;
export declare function createUserApiKey(options: {
    readonly name: string;
    readonly mcpAccess: McpAccess;
}, transport: GraphqlTransport): Promise<CreatedApiKey>;
export declare function isAuthenticationFailure(error: unknown): boolean;
export {};
//# sourceMappingURL=graphql.d.ts.map