export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
export const CLIENT_ID = "LWGH06SRvnBK7_72-QBwEEuL4kYepP2LzdlxMtWXv_o";
const SLOW_DOWN_INCREMENT_SECONDS = 5;
const DEFAULT_INTERVAL_SECONDS = 5;
export class DeviceFlowError extends Error {
    name = "DeviceFlowError";
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
    }
}
function endpoint(automationUrl, path) {
    return `${automationUrl.replace(/\/$/, "")}${path}`;
}
async function postForm(url, body, fetchImpl) {
    const response = await fetchImpl(url, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
        },
        body: new URLSearchParams(body).toString(),
    });
    const text = await response.text();
    let payload = {};
    try {
        payload = JSON.parse(text);
    }
    catch {
        payload = { error: "invalid_response", error_description: text.slice(0, 200) };
    }
    return { status: response.status, payload };
}
export async function requestDeviceAuthorization({ automationUrl, clientId = CLIENT_ID, fetchImpl = fetch, }) {
    const url = endpoint(automationUrl, "/oauth/authorize_device");
    let result;
    try {
        result = await postForm(url, { client_id: clientId }, fetchImpl);
    }
    catch (error) {
        throw new DeviceFlowError("transport", `could not reach ${url}: ${error.message}`);
    }
    const { status, payload } = result;
    if (status !== 200 || typeof payload["device_code"] !== "string") {
        const detail = String(payload["error_description"] ?? payload["error"] ?? `HTTP ${status}`);
        throw new DeviceFlowError(status === 401 || payload["error"] === "invalid_client" ? "invalid_client" : "transport", `${url} refused the device authorization request: ${detail}`);
    }
    return {
        deviceCode: payload["device_code"],
        userCode: String(payload["user_code"] ?? ""),
        verificationUri: String(payload["verification_uri"] ?? ""),
        verificationUriComplete: typeof payload["verification_uri_complete"] === "string"
            ? payload["verification_uri_complete"]
            : undefined,
        expiresInSeconds: Number(payload["expires_in"] ?? 300),
        intervalSeconds: Number(payload["interval"] ?? DEFAULT_INTERVAL_SECONDS),
    };
}
function toTokenSet(payload) {
    return {
        accessToken: String(payload["access_token"]),
        refreshToken: typeof payload["refresh_token"] === "string" && payload["refresh_token"]
            ? payload["refresh_token"]
            : undefined,
        expiresInSeconds: typeof payload["expires_in"] === "number" ? payload["expires_in"] : undefined,
    };
}
export async function refreshAccessToken({ automationUrl, refreshToken, clientId = CLIENT_ID, fetchImpl = fetch, }) {
    const url = endpoint(automationUrl, "/oauth/token");
    let result;
    try {
        result = await postForm(url, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }, fetchImpl);
    }
    catch (error) {
        throw new DeviceFlowError("transport", `could not reach ${url}: ${error.message}`);
    }
    const { payload } = result;
    if (typeof payload["access_token"] === "string" && payload["access_token"]) {
        return toTokenSet(payload);
    }
    throw new DeviceFlowError("invalid_grant", `the stored sign-in expired: ${String(payload["error_description"] ?? payload["error"] ?? "unknown error")}. Run login again.`);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function pollForAccessToken({ automationUrl, authorization, clientId = CLIENT_ID, fetchImpl = fetch, sleep = wait, now = () => Date.now(), onPending, }) {
    const url = endpoint(automationUrl, "/oauth/token");
    const deadline = now() + authorization.expiresInSeconds * 1000;
    let intervalSeconds = authorization.intervalSeconds || DEFAULT_INTERVAL_SECONDS;
    let attempt = 0;
    while (now() < deadline) {
        await sleep(intervalSeconds * 1000);
        attempt += 1;
        let result;
        try {
            result = await postForm(url, {
                grant_type: DEVICE_CODE_GRANT,
                device_code: authorization.deviceCode,
                client_id: clientId,
            }, fetchImpl);
        }
        catch (error) {
            throw new DeviceFlowError("transport", `could not reach ${url}: ${error.message}`);
        }
        const { status, payload } = result;
        const token = payload["access_token"];
        if (typeof token === "string" && token)
            return toTokenSet(payload);
        // A 429 is the gateway or rate limiter asking for room, not OAuth saying the
        // grant is dead. It used to fall through to the fatal branch, so a user who
        // took a minute to find the browser was thrown out with "sign-in failed:
        // Rate limit exceeded". Treat it as slow_down: widen and keep polling until
        // the deadline. Checked by status because a gateway limit is rarely JSON.
        if (status === 429) {
            intervalSeconds += SLOW_DOWN_INCREMENT_SECONDS;
            onPending?.(attempt);
            continue;
        }
        const error = String(payload["error"] ?? "");
        switch (error) {
            case "authorization_pending":
                onPending?.(attempt);
                continue;
            case "slow_down":
                intervalSeconds += SLOW_DOWN_INCREMENT_SECONDS;
                onPending?.(attempt);
                continue;
            case "access_denied":
                throw new DeviceFlowError("access_denied", "the sign-in request was declined.");
            case "expired_token":
                throw new DeviceFlowError("expired_token", "the sign-in request expired before it was approved. Run the command again.");
            case "invalid_client":
                throw new DeviceFlowError("invalid_client", "this deployment does not recognise the connect client. It may need the client registration migration.");
            default:
                throw new DeviceFlowError("invalid_grant", `sign-in failed: ${String(payload["error_description"] ?? (error || "unknown error"))}`);
        }
    }
    throw new DeviceFlowError("timeout", `the sign-in request was not approved within ${authorization.expiresInSeconds} seconds.`);
}
//# sourceMappingURL=device-flow.js.map