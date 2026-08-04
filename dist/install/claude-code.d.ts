export declare const MARKETPLACE = "jitera-product/connect";
export declare const MARKETPLACE_NAME = "jitera";
export declare const PLUGIN_NAME = "jitera-connect";
export interface CommandRunner {
    (command: string, args: readonly string[]): {
        status: number;
        stdout: string;
        stderr: string;
    };
}
export declare function isClaudeCodeAvailable(run?: CommandRunner): boolean;
export interface ClaudeInstallOptions {
    readonly apiKey: string;
    readonly environment: string;
    readonly run?: CommandRunner;
}
export interface ClaudeInstallResult {
    readonly installed: boolean;
    readonly reason?: string;
}
export declare function installClaudeCodePlugin({ apiKey, environment, run, }: ClaudeInstallOptions): ClaudeInstallResult;
//# sourceMappingURL=claude-code.d.ts.map