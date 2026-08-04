import type { Theme } from "./theme.ts";
export declare class SelectCancelledError extends Error {
    readonly name = "SelectCancelledError";
    constructor();
}
export interface SelectInput {
    setRawMode?(mode: boolean): unknown;
    resume?(): unknown;
    pause?(): unknown;
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
    off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
}
export interface SelectOutput {
    write(chunk: string): unknown;
}
export interface SelectOptions<T> {
    readonly items: readonly T[];
    readonly prompt: string;
    readonly label: (item: T) => string;
    readonly theme: Theme;
    readonly input: SelectInput;
    readonly output: SelectOutput;
}
export declare function interactiveSelect<T>({ items, prompt, label, theme, input, output }: SelectOptions<T>): Promise<T>;
//# sourceMappingURL=select.d.ts.map