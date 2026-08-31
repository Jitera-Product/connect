export declare class ProcessExit extends Error {
    readonly name = "ProcessExit";
    readonly code: number;
    constructor(code: number);
}
export declare function endWith(code: number): never;
export declare function runCommand(body: () => Promise<void> | void): Promise<void>;
//# sourceMappingURL=exit.d.ts.map