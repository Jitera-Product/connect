export type ColourLevel = 0 | 1 | 2;
export interface ColourEnvironment {
    readonly env: NodeJS.ProcessEnv;
    readonly isTty: boolean;
}
export declare function detectLevel({ env, isTty }: ColourEnvironment): ColourLevel;
export interface Theme {
    readonly level: ColourLevel;
    readonly mark: string;
    brand(text: string): string;
    accent(text: string): string;
    bold(text: string): string;
    dim(text: string): string;
    ok(text: string): string;
    err(text: string): string;
}
export declare function createTheme(environment: ColourEnvironment): Theme;
export declare function heading(theme: Theme, brand: string, subtitle: string): string;
export interface Spinner {
    stop(finalLine?: string): void;
}
export interface SpinnerOptions {
    readonly theme: Theme;
    readonly label: string;
    readonly write: (chunk: string) => void;
    readonly animate: boolean;
}
export declare function startSpinner({ theme, label, write, animate }: SpinnerOptions): Spinner;
//# sourceMappingURL=theme.d.ts.map