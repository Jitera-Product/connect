export declare const DEFAULT_ENVIRONMENT = "studio";
export declare const SUPPORTED_ENVIRONMENTS: readonly ["studio", "studio-stage", "studio-01", "studio-06"];
export type Deployment = {
    readonly kind: "production";
} | {
    readonly kind: "stage";
} | {
    readonly kind: "pilot";
    readonly instance: string;
};
export declare class UnknownEnvironmentError extends Error {
    readonly name = "UnknownEnvironmentError";
    readonly value: unknown;
    constructor(value: unknown);
}
export declare function parseEnvironment(environment?: string | null): Deployment;
export declare function resolveMcpUrl(environment?: string | null): string;
export declare function resolveApiBaseUrl(environment?: string | null): string;
export declare function resolveStudioUrl(environment?: string | null): string;
//# sourceMappingURL=environments.d.ts.map