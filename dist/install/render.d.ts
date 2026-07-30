export declare const DEFAULT_BRAND = "Jitera";
export interface RenderValues {
    readonly BRAND?: string;
    readonly MCP_URL?: string;
    readonly DOCS_URL?: string;
}
export declare class UnresolvedTokenError extends Error {
    readonly name = "UnresolvedTokenError";
    readonly tokens: readonly string[];
    constructor(tokens: readonly string[]);
}
export declare function render(text: string, values: RenderValues): string;
//# sourceMappingURL=render.d.ts.map