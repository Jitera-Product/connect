import { resolveStudioUrl } from "./environments.ts";

export const DISCOVERY_PATHS = ["/p/jitera-connect.json", "/jitera-connect.json"] as const;

export interface DeploymentConfig {
  readonly mcpUrl: string;
  readonly apiBaseUrl: string;
  readonly automationUrl: string;
  readonly brand: string;
}

export class DiscoveryError extends Error {
  override readonly name = "DiscoveryError";
  readonly studioUrl: string;
  readonly attempts: readonly string[];

  constructor(studioUrl: string, attempts: readonly string[], reason: string) {
    super(
      `could not read the deployment configuration from ${studioUrl} (${reason}). ` +
        `Tried: ${attempts.join(", ")}. ` +
        `Check the environment name, or pass --mcp-url to bypass discovery.`
    );
    this.studioUrl = studioUrl;
    this.attempts = attempts;
  }
}

function isUsable(value: unknown): value is DeploymentConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate["mcpUrl"] === "string" && candidate["mcpUrl"].startsWith("http");
}

export interface DiscoverOptions {
  readonly environment?: string | undefined;
  readonly studioUrl?: string | undefined;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export async function discoverDeployment({
  environment,
  studioUrl: studioOverride,
  timeoutMs = 8000,
  fetchImpl = fetch,
}: DiscoverOptions = {}): Promise<DeploymentConfig> {
  const studioUrl = (studioOverride ?? "").replace(/\/$/, "") || resolveStudioUrl(environment);
  const attempts: string[] = [];
  let lastReason = "no response";

  for (const path of DISCOVERY_PATHS) {
    const url = `${studioUrl}${path}`;
    attempts.push(url);
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        lastReason = `HTTP ${response.status}`;
        continue;
      }
      const payload: unknown = await response.json();
      if (!isUsable(payload)) {
        lastReason = "the response did not contain an mcpUrl";
        continue;
      }
      const record = payload as unknown as Record<string, unknown>;
      return {
        mcpUrl: payload.mcpUrl,
        apiBaseUrl: typeof record["apiBaseUrl"] === "string" ? record["apiBaseUrl"] : "",
        automationUrl: typeof record["automationUrl"] === "string" ? record["automationUrl"] : "",
        brand: typeof record["brand"] === "string" && record["brand"] ? record["brand"] : "Jitera",
      };
    } catch (error) {
      const cause = error as Error;
      lastReason =
        cause.name === "TimeoutError" ? `timed out after ${timeoutMs}ms` : cause.message;
    }
  }

  throw new DiscoveryError(studioUrl, attempts, lastReason);
}
