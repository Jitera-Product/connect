import test from "node:test";
import assert from "node:assert/strict";

import {
  DEVICE_CODE_GRANT,
  DeviceFlowError,
  pollForAccessToken,
  refreshAccessToken,
  requestDeviceAuthorization,
  type DeviceAuthorization,
} from "../src/device-flow.ts";

const AUTOMATION = "https://automation.example.com/gateway/automation/private";

interface Recorded {
  readonly url: string;
  readonly body: URLSearchParams;
}

function stub(
  responses: readonly { status?: number; body: Record<string, unknown> }[]
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let index = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: new URLSearchParams(String(init?.body ?? "")),
    });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(response?.body ?? {}), {
      status: response?.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const AUTHORIZATION: DeviceAuthorization = {
  deviceCode: "dev-code",
  userCode: "ABCD1234",
  verificationUri: "https://studio.example.com/device",
  verificationUriComplete: "https://studio.example.com/device?user_code=ABCD1234",
  expiresInSeconds: 300,
  intervalSeconds: 5,
};

const noSleep = async (): Promise<void> => {};

test("a device authorization request returns the codes and cadence", async () => {
  const { fetchImpl, calls } = stub([
    {
      body: {
        device_code: "dev-code",
        user_code: "ABCD1234",
        verification_uri: "https://studio.example.com/device",
        verification_uri_complete: "https://studio.example.com/device?user_code=ABCD1234",
        expires_in: 300,
        interval: 5,
      },
    },
  ]);

  const auth = await requestDeviceAuthorization({ automationUrl: AUTOMATION, fetchImpl });

  assert.equal(auth.deviceCode, "dev-code");
  assert.equal(auth.userCode, "ABCD1234");
  assert.equal(auth.intervalSeconds, 5);
  assert.equal(calls[0]?.url, `${AUTOMATION}/oauth/authorize_device`);
  assert.ok(calls[0]?.body.get("client_id"));
});

test("a deployment without the client registration says so plainly", async () => {
  const { fetchImpl } = stub([{ status: 401, body: { error: "invalid_client" } }]);
  await assert.rejects(
    () => requestDeviceAuthorization({ automationUrl: AUTOMATION, fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof DeviceFlowError);
      assert.equal(error.reason, "invalid_client");
      return true;
    }
  );
});

test("polling keeps going while authorization is pending", async () => {
  const { fetchImpl, calls } = stub([
    { status: 400, body: { error: "authorization_pending" } },
    { status: 400, body: { error: "authorization_pending" } },
    { body: { access_token: "at-123", refresh_token: "rt-456", expires_in: 3600 } },
  ]);
  const pending: number[] = [];

  const token = await pollForAccessToken({
    automationUrl: AUTOMATION,
    authorization: AUTHORIZATION,
    fetchImpl,
    sleep: noSleep,
    onPending: (attempt) => pending.push(attempt),
  });

  assert.equal(token.accessToken, "at-123");
  assert.equal(token.refreshToken, "rt-456");
  assert.equal(token.expiresInSeconds, 3600);
  assert.deepEqual(pending, [1, 2]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.body.get("grant_type"), DEVICE_CODE_GRANT);
  assert.equal(calls[0]?.body.get("device_code"), "dev-code");
});

test("slow_down widens the interval instead of hammering the server", async () => {
  const delays: number[] = [];
  const { fetchImpl } = stub([
    { status: 400, body: { error: "slow_down" } },
    { status: 400, body: { error: "authorization_pending" } },
    { body: { access_token: "at" } },
  ]);

  await pollForAccessToken({
    automationUrl: AUTOMATION,
    authorization: AUTHORIZATION,
    fetchImpl,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });

  assert.deepEqual(delays, [5000, 10000, 10000]);
});

test("a declined request fails immediately, without retrying", async () => {
  const { fetchImpl, calls } = stub([{ status: 400, body: { error: "access_denied" } }]);
  await assert.rejects(
    () =>
      pollForAccessToken({
        automationUrl: AUTOMATION,
        authorization: AUTHORIZATION,
        fetchImpl,
        sleep: noSleep,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DeviceFlowError);
      assert.equal(error.reason, "access_denied");
      return true;
    }
  );
  assert.equal(calls.length, 1, "a decline must not be retried");
});

test("an expired device code tells the user to start again", async () => {
  const { fetchImpl } = stub([{ status: 400, body: { error: "expired_token" } }]);
  await assert.rejects(
    () =>
      pollForAccessToken({
        automationUrl: AUTOMATION,
        authorization: AUTHORIZATION,
        fetchImpl,
        sleep: noSleep,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DeviceFlowError);
      assert.equal(error.reason, "expired_token");
      assert.match(error.message, /again/);
      return true;
    }
  );
});

test("polling gives up once the authorization window closes", async () => {
  const { fetchImpl } = stub([{ status: 400, body: { error: "authorization_pending" } }]);
  let clock = 0;

  await assert.rejects(
    () =>
      pollForAccessToken({
        automationUrl: AUTOMATION,
        authorization: { ...AUTHORIZATION, expiresInSeconds: 12 },
        fetchImpl,
        sleep: async (ms) => {
          clock += ms;
        },
        now: () => clock,
      }),
    (error: unknown) => {
      assert.ok(error instanceof DeviceFlowError);
      assert.equal(error.reason, "timeout");
      return true;
    }
  );
});

test("an unreachable automation host is reported as transport, not a decline", async () => {
  const fetchImpl = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  await assert.rejects(
    () => requestDeviceAuthorization({ automationUrl: AUTOMATION, fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof DeviceFlowError);
      assert.equal(error.reason, "transport");
      assert.match(error.message, /ECONNREFUSED/);
      return true;
    }
  );
});

test("a non json body does not crash the flow", async () => {
  const fetchImpl = (async () =>
    new Response("<html>gateway error</html>", { status: 502 })) as typeof fetch;
  await assert.rejects(
    () => requestDeviceAuthorization({ automationUrl: AUTOMATION, fetchImpl }),
    DeviceFlowError
  );
});

test("a token without a refresh token still resolves", async () => {
  const { fetchImpl } = stub([{ body: { access_token: "at-only" } }]);
  const token = await pollForAccessToken({
    automationUrl: AUTOMATION,
    authorization: AUTHORIZATION,
    fetchImpl,
    sleep: noSleep,
  });
  assert.equal(token.accessToken, "at-only");
  assert.equal(token.refreshToken, undefined);
});

test("a refresh grant exchanges the stored token for a fresh set", async () => {
  const { fetchImpl, calls } = stub([
    { body: { access_token: "at-new", refresh_token: "rt-new", expires_in: 7200 } },
  ]);

  const token = await refreshAccessToken({
    automationUrl: AUTOMATION,
    refreshToken: "rt-old",
    fetchImpl,
  });

  assert.equal(token.accessToken, "at-new");
  assert.equal(token.refreshToken, "rt-new");
  assert.equal(calls[0]?.url, `${AUTOMATION}/oauth/token`);
  assert.equal(calls[0]?.body.get("grant_type"), "refresh_token");
  assert.equal(calls[0]?.body.get("refresh_token"), "rt-old");
});

test("a rejected refresh reports invalid_grant so the caller can re-login", async () => {
  const { fetchImpl } = stub([{ status: 400, body: { error: "invalid_grant" } }]);
  await assert.rejects(
    () => refreshAccessToken({ automationUrl: AUTOMATION, refreshToken: "rt-dead", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof DeviceFlowError);
      assert.equal(error.reason, "invalid_grant");
      return true;
    }
  );
});
