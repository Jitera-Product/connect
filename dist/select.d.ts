import type { Theme } from "./theme.ts";
export declare class SelectCancelledError extends Error {
    readonly name = "SelectCancelledError";
    constructor();
}
export declare class InvalidChoiceError extends Error {
    readonly name = "InvalidChoiceError";
    readonly answer: string;
    constructor(answer: string);
}
export declare function chooseFrom<T>({ items, prompt, label, theme, }: {
    readonly items: readonly T[];
    readonly prompt: string;
    readonly label: (item: T) => string;
    readonly theme: Theme;
}): Promise<T>;
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