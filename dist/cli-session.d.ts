export interface CliSession {
    readonly automationUrl: string;
    readonly environment?: string | undefined;
    readonly accessToken: string;
    readonly refreshToken?: string | undefined;
    readonly expiresAt?: number | undefined;
}
export declare function sessionPath(env?: NodeJS.ProcessEnv): string;
export declare function saveCliSession(session: CliSession, env?: NodeJS.ProcessEnv): void;
export declare function loadCliSession(env?: NodeJS.ProcessEnv): CliSession | undefined;
export declare function isExpired(session: CliSession, now?: number): boolean;
//# sourceMappingURL=cli-session.d.ts.map