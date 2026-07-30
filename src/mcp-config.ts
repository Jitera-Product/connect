import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type ServerEntry = Record<string, unknown>;
export type ClientConfig = Record<string, unknown>;

export class MalformedConfigError extends Error {
  override readonly name = "MalformedConfigError";
  readonly path: string;

  constructor(path: string, cause: Error) {
    super(
      `${path} exists but is not valid JSON, so it cannot be merged safely. ` +
        `Fix or move the file, then run again. Parser said: ${cause.message}`
    );
    this.path = path;
  }
}

export function readConfig(path: string): ClientConfig {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw) as ClientConfig;
  } catch (cause) {
    throw new MalformedConfigError(path, cause as Error);
  }
}

export function mergeServer(
  config: ClientConfig,
  key: string,
  name: string,
  server: ServerEntry
): ClientConfig {
  const servers = { ...((config[key] as Record<string, ServerEntry> | undefined) ?? {}) };
  servers[name] = server;
  return { ...config, [key]: servers };
}

export function removeServer(config: ClientConfig, key: string, name: string): ClientConfig {
  const existing = config[key] as Record<string, ServerEntry> | undefined;
  if (!existing) return { ...config };
  const servers = { ...existing };
  delete servers[name];
  const next = { ...config, [key]: servers };
  if (Object.keys(servers).length === 0) delete next[key];
  return next;
}

export function writeConfig(path: string, config: ClientConfig): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, undefined, 2)}\n`, "utf8");
}
