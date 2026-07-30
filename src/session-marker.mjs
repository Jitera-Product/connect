import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

export function markerPath(sessionId, kind, root = tmpdir()) {
  const digest = createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 32);
  return join(root, "jitera-connect", `${kind}-${digest}`);
}

export function claimOnce(sessionId, kind, root = tmpdir()) {
  if (!sessionId) return false;
  const path = markerPath(sessionId, kind, root);
  if (existsSync(path)) return false;
  try {
    mkdirSync(join(root, "jitera-connect"), { recursive: true });
    writeFileSync(path, "", { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}
