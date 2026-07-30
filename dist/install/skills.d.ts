import { type RenderValues } from "./render.ts";
export interface SkillInstallOptions {
    readonly packageRoot: string;
    readonly targetDirs: readonly string[];
    readonly values: RenderValues;
    readonly dryRun?: boolean;
}
export interface SkillInstallResult {
    readonly skills: readonly string[];
    readonly written: readonly string[];
    readonly changed: boolean;
}
export declare function listSkills(packageRoot: string): string[];
export declare function installSkills({ packageRoot, targetDirs, values, dryRun, }: SkillInstallOptions): SkillInstallResult;
export declare function uninstallSkills({ packageRoot, targetDirs, dryRun, }: Omit<SkillInstallOptions, "values">): SkillInstallResult;
//# sourceMappingURL=skills.d.ts.map