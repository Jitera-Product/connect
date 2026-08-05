import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Refreshing this close to expiry counts as expired, so a request never starts
// with a token that dies mid-flight.
const EXPIRY_MARGIN_MS = 60_000;

export interface CliSession {
  readonly automationUrl: string;
  readonly environment?: string | undefined;
  readonly accessToken: string;
  readonly refreshToken?: string | undefined;
  readonly expiresAt?: number | undefined;
}

export function sessionPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env["JITERA_CONNECT_CONFIG_DIR"];
  const dir = override || join(homedir(), ".config", "jitera-connect");
  return join(dir, "session.json");
}

export function saveCliSession(session: CliSession, env: NodeJS.ProcessEnv = process.env): void {
  const path = sessionPath(env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(session, undefined, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

export function loadCliSession(env: NodeJS.ProcessEnv = process.env): CliSession | undefined {
  const path = sessionPath(env);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CliSession;
    if (typeof parsed.accessToken !== "string" || typeof parsed.automationUrl !== "string") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function isExpired(session: CliSession, now: number = Date.now()): boolean {
  return typeof session.expiresAt === "number" && now >= session.expiresAt - EXPIRY_MARGIN_MS;
}
