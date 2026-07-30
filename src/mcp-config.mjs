import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class MalformedConfigError extends Error {
  constructor(path, cause) {
    super(
      `${path} exists but is not valid JSON, so it cannot be merged safely. ` +
        `Fix or move the file, then run again. Parser said: ${cause.message}`
    );
    this.name = "MalformedConfigError";
    this.path = path;
  }
}

export function readConfig(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new MalformedConfigError(path, cause);
  }
}

export function mergeServer(config, key, name, server) {
  const next = { ...config };
  next[key] = { ...(next[key] ?? {}) };
  next[key][name] = server;
  return next;
}

export function removeServer(config, key, name) {
  const next = { ...config };
  if (!next[key]) return next;
  next[key] = { ...next[key] };
  delete next[key][name];
  if (Object.keys(next[key]).length === 0) delete next[key];
  return next;
}

export function writeConfig(path, config) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, undefined, 2)}\n`, "utf8");
}
