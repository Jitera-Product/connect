export interface SessionStatus {
    readonly configured?: boolean | undefined;
    readonly environment?: string | undefined;
    readonly recallMs?: number | undefined;
    readonly recallChars?: number | undefined;
    readonly recallError?: string | undefined;
}
export declare function statusPath(sessionId: string, root?: string): string;
export declare function writeSessionStatus(sessionId: string | undefined, patch: SessionStatus, root?: string): void;
export declare function readSessionStatus(sessionId: string | undefined, root?: string): SessionStatus | undefined;
//# sourceMappingURL=session-status.d.ts.map