export type InitTarget = {
    readonly kind: "write";
    readonly dir: string;
    readonly repoRoot?: string;
} | {
    readonly kind: "refuse";
    readonly reason: string;
};
export declare function broadDirectoryReason(dir: string): string;
export declare function isBroadDirectory(dir: string, home?: string): boolean;
export declare function chooseInitTarget({ cwd, gitRoot, home, }: {
    readonly cwd: string;
    readonly gitRoot: string | undefined;
    readonly home?: string;
}): InitTarget;
//# sourceMappingURL=init-target.d.ts.map