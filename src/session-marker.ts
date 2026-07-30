import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const NAMESPACE = "jitera-connect";

export type MarkerKind = "recall";

export function markerPath(sessionId: string, kind: MarkerKind, root: string = tmpdir()): string {
  const digest = createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
  return join(root, NAMESPACE, `${kind}-${digest}`);
}

export function claimOnce(
  sessionId: string | undefined,
  kind: MarkerKind,
  root: string = tmpdir()
): boolean {
  if (!sessionId) return false;
  const path = markerPath(sessionId, kind, root);
  if (existsSync(path)) return false;
  try {
    mkdirSync(join(root, NAMESPACE), { recursive: true });
    writeFileSync(path, "", { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}
