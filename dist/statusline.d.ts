import type { SessionStatus } from "./session-status.ts";
export interface StatusLineInput {
    readonly status?: SessionStatus | undefined;
    readonly markerEnvironment?: string | undefined;
    readonly bound?: boolean | undefined;
}
export declare function renderStatusLine({ status, markerEnvironment, bound, }: StatusLineInput): string;
//# sourceMappingURL=statusline.d.ts.map