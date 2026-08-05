export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
export const CLIENT_ID = "LWGH06SRvnBK7_72-QBwEEuL4kYepP2LzdlxMtWXv_o";

const SLOW_DOWN_INCREMENT_SECONDS = 5;
const DEFAULT_INTERVAL_SECONDS = 5;

export interface DeviceAuthorization {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete: string | undefined;
  readonly expiresInSeconds: number;
  readonly intervalSeconds: number;
}

export type DeviceFlowFailure =
  | "access_denied"
  | "expired_token"
  | "invalid_client"
  | "invalid_grant"
  | "timeout"
  | "transport";

export class DeviceFlowError extends Error {
  override readonly name = "DeviceFlowError";
  readonly reason: DeviceFlowFailure;

  constructor(reason: DeviceFlowFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface DeviceFlowTransport {
  readonly automationUrl: string;
  readonly clientId?: string;
  readonly fetchImpl?: typeof fetch;
}

function endpoint(automationUrl: string, path: string): string {
  return `${automationUrl.replace(/\/$/, "")}${path}`;
}

async function postForm(
  url: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = { error: "invalid_response", error_description: text.slice(0, 200) };
  }
  return { status: response.status, payload };
}

export async function requestDeviceAuthorization({
  automationUrl,
  clientId = CLIENT_ID,
  fetchImpl = fetch,
}: DeviceFlowTransport): Promise<DeviceAuthorization> {
  const url = endpoint(automationUrl, "/oauth/authorize_device");
  let result;
  try {
    result = await postForm(url, { client_id: clientId }, fetchImpl);
  } catch (error) {
    throw new DeviceFlowError(
      "transport",
      `could not reach ${url}: ${(error as Error).message}`
    );
  }

  const { status, payload } = result;
  if (status !== 200 || typeof payload["device_code"] !== "string") {
    const detail = String(payload["error_description"] ?? payload["error"] ?? `HTTP ${status}`);
    throw new DeviceFlowError(
      status === 401 || payload["error"] === "invalid_client" ? "invalid_client" : "transport",
      `${url} refused the device authorization request: ${detail}`
    );
  }

  return {
    deviceCode: payload["device_code"],
    userCode: String(payload["user_code"] ?? ""),
    verificationUri: String(payload["verification_uri"] ?? ""),
    verificationUriComplete:
      typeof payload["verification_uri_complete"] === "string"
        ? payload["verification_uri_complete"]
        : undefined,
    expiresInSeconds: Number(payload["expires_in"] ?? 300),
    intervalSeconds: Number(payload["interval"] ?? DEFAULT_INTERVAL_SECONDS),
  };
}

export interface TokenSet {
  readonly accessToken: string;
  readonly refreshToken?: string | undefined;
  readonly expiresInSeconds?: number | undefined;
}

function toTokenSet(payload: Record<string, unknown>): TokenSet {
  return {
    accessToken: String(payload["access_token"]),
    refreshToken:
      typeof payload["refresh_token"] === "string" && payload["refresh_token"]
        ? payload["refresh_token"]
        : undefined,
    expiresInSeconds:
      typeof payload["expires_in"] === "number" ? payload["expires_in"] : undefined,
  };
}

export interface RefreshOptions extends DeviceFlowTransport {
  readonly refreshToken: string;
}

export async function refreshAccessToken({
  automationUrl,
  refreshToken,
  clientId = CLIENT_ID,
  fetchImpl = fetch,
}: RefreshOptions): Promise<TokenSet> {
  const url = endpoint(automationUrl, "/oauth/token");
  let result;
  try {
    result = await postForm(
      url,
      { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId },
      fetchImpl
    );
  } catch (error) {
    throw new DeviceFlowError("transport", `could not reach ${url}: ${(error as Error).message}`);
  }

  const { payload } = result;
  if (typeof payload["access_token"] === "string" && payload["access_token"]) {
    return toTokenSet(payload);
  }
  throw new DeviceFlowError(
    "invalid_grant",
    `the stored sign-in expired: ${String(payload["error_description"] ?? payload["error"] ?? "unknown error")}. Run login again.`
  );
}

export interface PollOptions extends DeviceFlowTransport {
  readonly authorization: DeviceAuthorization;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly onPending?: (attempt: number) => void;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function pollForAccessToken({
  automationUrl,
  authorization,
  clientId = CLIENT_ID,
  fetchImpl = fetch,
  sleep = wait,
  now = () => Date.now(),
  onPending,
}: PollOptions): Promise<TokenSet> {
  const url = endpoint(automationUrl, "/oauth/token");
  const deadline = now() + authorization.expiresInSeconds * 1000;
  let intervalSeconds = authorization.intervalSeconds || DEFAULT_INTERVAL_SECONDS;
  let attempt = 0;

  while (now() < deadline) {
    await sleep(intervalSeconds * 1000);
    attempt += 1;

    let result;
    try {
      result = await postForm(
        url,
        {
          grant_type: DEVICE_CODE_GRANT,
          device_code: authorization.deviceCode,
          client_id: clientId,
        },
        fetchImpl
      );
    } catch (error) {
      throw new DeviceFlowError("transport", `could not reach ${url}: ${(error as Error).message}`);
    }

    const { payload } = result;
    const token = payload["access_token"];
    if (typeof token === "string" && token) return toTokenSet(payload);

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
        throw new DeviceFlowError(
          "expired_token",
          "the sign-in request expired before it was approved. Run the command again."
        );
      case "invalid_client":
        throw new DeviceFlowError(
          "invalid_client",
          "this deployment does not recognise the connect client. It may need the client registration migration."
        );
      default:
        throw new DeviceFlowError(
          "invalid_grant",
          `sign-in failed: ${String(payload["error_description"] ?? (error || "unknown error"))}`
        );
    }
  }

  throw new DeviceFlowError(
    "timeout",
    `the sign-in request was not approved within ${authorization.expiresInSeconds} seconds.`
  );
}
