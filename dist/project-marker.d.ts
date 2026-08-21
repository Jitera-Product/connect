export declare const MARKER_FILENAME = ".jitera.json";
export interface ProjectMarker {
    readonly environment?: string | undefined;
    readonly project?: string | undefined;
    readonly agents?: readonly string[] | undefined;
}
export interface FoundProjectMarker extends ProjectMarker {
    readonly path: string;
}
export declare function readProjectMarker(startDir: string): FoundProjectMarker | undefined;
export interface MarkerWriteResult {
    readonly path: string;
    readonly changed: boolean;
}
export declare function writeProjectMarker(root: string, marker: ProjectMarker, dryRun?: boolean): MarkerWriteResult;
//# sourceMappingURL=project-marker.d.ts.map