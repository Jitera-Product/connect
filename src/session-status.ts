import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const NAMESPACE = "jitera-connect";

export interface SessionStatus {
  readonly configured?: boolean | undefined;
  readonly environment?: string | undefined;
  readonly recallMs?: number | undefined;
  readonly recallChars?: number | undefined;
  readonly recallError?: string | undefined;
}

export function statusPath(sessionId: string, root: string = tmpdir()): string {
  const digest = createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
  return join(root, NAMESPACE, `status-${digest}.json`);
}

// Best-effort by design: the status line is cosmetic, so neither writer (hooks)
// nor reader (statusline) may ever fail a session over it.
export function writeSessionStatus(
  sessionId: string | undefined,
  patch: SessionStatus,
  root: string = tmpdir()
): void {
  if (!sessionId) return;
  try {
    const path = statusPath(sessionId, root);
    let existing: Record<string, unknown> = {};
    if (existsSync(path)) {
      try {
        existing = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      } catch {
        existing = {};
      }
    }
    mkdirSync(join(root, NAMESPACE), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ ...existing, ...patch })}\n`, "utf8");
  } catch {
    return;
  }
}

export function readSessionStatus(
  sessionId: string | undefined,
  root: string = tmpdir()
): SessionStatus | undefined {
  if (!sessionId) return undefined;
  const path = statusPath(sessionId, root);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SessionStatus;
  } catch {
    return undefined;
  }
}
