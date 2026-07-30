export interface TomlSection {
    readonly header: string | undefined;
    readonly lines: readonly string[];
}
export declare function splitSections(source: string): TomlSection[];
export declare function joinSections(sections: readonly TomlSection[]): string;
export declare function ownsHeader(header: string | undefined, table: string): boolean;
export declare function removeTable(source: string, table: string): string;
export declare function upsertTable(source: string, table: string, body: string): string;
export declare function hasRootKey(source: string, key: string): boolean;
export declare function ensureRootKey(source: string, key: string, value: string): string;
//# sourceMappingURL=toml-section.d.ts.map