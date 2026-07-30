import { type RenderValues } from "./render.ts";
export declare const BEGIN_MARKER = "<!-- BEGIN JITERA CONNECT -->";
export declare const END_MARKER = "<!-- END JITERA CONNECT -->";
export interface BlockUpsertResult {
    readonly content: string;
    readonly changed: boolean;
    readonly action: "created" | "replaced" | "appended" | "unchanged";
}
export declare function upsertBlock(existing: string | undefined, block: string): BlockUpsertResult;
export declare function ensureClaudeImport(existing: string | undefined): BlockUpsertResult;
export interface AgentsMdOptions {
    readonly packageRoot: string;
    readonly projectRoot: string;
    readonly values: RenderValues;
    readonly dryRun?: boolean;
}
export interface AgentsMdResult {
    readonly agentsPath: string;
    readonly claudePath: string;
    readonly agents: BlockUpsertResult;
    readonly claude: BlockUpsertResult;
    readonly changed: boolean;
}
export declare function writeAgentsMd({ packageRoot, projectRoot, values, dryRun, }: AgentsMdOptions): AgentsMdResult;
//# sourceMappingURL=agents-md.d.ts.map