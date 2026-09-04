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
export declare class NoInputError extends Error {
    readonly name = "NoInputError";
    constructor();
}
export declare function chooseFrom<T>({ items, prompt, label, theme, }: {
    readonly items: readonly T[];
    readonly prompt: string;
    readonly label: (item: T) => string;
    readonly theme: Theme;
}): Promise<T>;
export interface Key {
    readonly name?: string;
    readonly ctrl?: boolean;
    readonly meta?: boolean;
    readonly shift?: boolean;
    readonly sequence?: string;
}
export interface SelectInput {
    setRawMode?(mode: boolean): unknown;
    resume?(): unknown;
    pause?(): unknown;
    on(event: "keypress", listener: (str: string | undefined, key: Key) => void): unknown;
    off(event: "keypress", listener: (str: string | undefined, key: Key) => void): unknown;
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
type Action = {
    readonly kind: "move";
    readonly delta: 1 | -1;
} | {
    readonly kind: "jump";
    readonly index: number;
} | {
    readonly kind: "confirm";
} | {
    readonly kind: "cancel";
} | {
    readonly kind: "none";
};
export declare function parseKey(str: string | undefined, key: Key, count: number): Action;
export declare function interactiveSelect<T>({ items, prompt, label, theme, input, output }: SelectOptions<T>): Promise<T>;
type MultiAction = {
    readonly kind: "move";
    readonly delta: 1 | -1;
} | {
    readonly kind: "toggle";
} | {
    readonly kind: "all";
} | {
    readonly kind: "none_of_them";
} | {
    readonly kind: "confirm";
} | {
    readonly kind: "cancel";
} | {
    readonly kind: "none";
};
export declare function parseMultiKey(str: string | undefined, key: Key): MultiAction;
export interface MultiSelectOptions<T> extends SelectOptions<T> {
    readonly requireOne?: boolean;
    readonly selected?: (item: T) => boolean;
    readonly viewport?: number;
    readonly columns?: number;
}
export declare function multiSelect<T>({ items, prompt, label, theme, input, output, selected, viewport, columns, requireOne, }: MultiSelectOptions<T>): Promise<T[]>;
export declare function chooseManyFrom<T>({ items, prompt, label, theme, selected, requireOne, }: {
    readonly items: readonly T[];
    readonly prompt: string;
    readonly label: (item: T) => string;
    readonly theme: Theme;
    readonly selected?: (item: T) => boolean;
    readonly requireOne?: boolean;
}): Promise<T[]>;
export {};
//# sourceMappingURL=select.d.ts.map