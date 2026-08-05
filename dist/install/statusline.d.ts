export declare const STATUS_COMMAND: string;
export interface StatusLineInstallOptions {
    readonly home: string;
    readonly dryRun?: boolean;
}
export interface StatusLineInstallResult {
    readonly installed: boolean;
    readonly reason?: string;
    readonly path: string;
}
export declare function installStatusLine({ home, dryRun, }: StatusLineInstallOptions): StatusLineInstallResult;
//# sourceMappingURL=statusline.d.ts.map