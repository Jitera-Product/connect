export declare const DISCOVERY_PATHS: readonly ["/p/jitera-connect.json", "/jitera-connect.json"];
export interface DeploymentConfig {
    readonly mcpUrl: string;
    readonly apiBaseUrl: string;
    readonly automationUrl: string;
    readonly brand: string;
}
export declare class DiscoveryError extends Error {
    readonly name = "DiscoveryError";
    readonly studioUrl: string;
    readonly attempts: readonly string[];
    constructor(studioUrl: string, attempts: readonly string[], reason: string);
}
export interface DiscoverOptions {
    readonly environment?: string | undefined;
    readonly studioUrl?: string | undefined;
    readonly timeoutMs?: number;
    readonly fetchImpl?: typeof fetch;
}
export declare function discoverDeployment({ environment, studioUrl: studioOverride, timeoutMs, fetchImpl, }?: DiscoverOptions): Promise<DeploymentConfig>;
//# sourceMappingURL=discovery.d.ts.map