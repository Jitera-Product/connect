export declare const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
export declare const CLIENT_ID = "LWGH06SRvnBK7_72-QBwEEuL4kYepP2LzdlxMtWXv_o";
export interface DeviceAuthorization {
    readonly deviceCode: string;
    readonly userCode: string;
    readonly verificationUri: string;
    readonly verificationUriComplete: string | undefined;
    readonly expiresInSeconds: number;
    readonly intervalSeconds: number;
}
export type DeviceFlowFailure = "access_denied" | "expired_token" | "invalid_client" | "invalid_grant" | "timeout" | "transport";
export declare class DeviceFlowError extends Error {
    readonly name = "DeviceFlowError";
    readonly reason: DeviceFlowFailure;
    constructor(reason: DeviceFlowFailure, message: string);
}
export interface DeviceFlowTransport {
    readonly automationUrl: string;
    readonly clientId?: string;
    readonly fetchImpl?: typeof fetch;
}
export declare function requestDeviceAuthorization({ automationUrl, clientId, fetchImpl, }: DeviceFlowTransport): Promise<DeviceAuthorization>;
export interface PollOptions extends DeviceFlowTransport {
    readonly authorization: DeviceAuthorization;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly now?: () => number;
    readonly onPending?: (attempt: number) => void;
}
export declare function pollForAccessToken({ automationUrl, authorization, clientId, fetchImpl, sleep, now, onPending, }: PollOptions): Promise<string>;
//# sourceMappingURL=device-flow.d.ts.map