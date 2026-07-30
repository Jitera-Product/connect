import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

export function runNode(
  scriptRelPath: string,
  options: { input?: unknown; env?: NodeJS.ProcessEnv; args?: readonly string[]; isolatedTmp?: boolean } = {}
): Promise<RunResult> {
  const { input, env = {}, args = [], isolatedTmp = true } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, scriptRelPath), ...args], {
      env: {
        ...process.env,
        ...(isolatedTmp ? { TMPDIR: mkdtempSync(join(tmpdir(), "jc-test-")) } : {}),
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    if (input !== undefined) child.stdin.end(JSON.stringify(input));
    else child.stdin.end();
  });
}

export interface StubServer {
  readonly url: string;
  readonly requests: readonly Record<string, unknown>[];
  readonly headers: readonly IncomingMessage["headers"][];
  close(): Promise<void>;
}

export type StubHandler = (
  body: Record<string, unknown>,
  res: ServerResponse,
  req: IncomingMessage
) => void;

export function stubServer(handler?: StubHandler): Promise<StubServer> {
  const requests: Record<string, unknown>[] = [];
  const headers: IncomingMessage["headers"][] = [];

  const server = createServer((req, res) => {
    headers.push(req.headers);
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        body = {};
      }
      requests.push(body);
      if (handler) return handler(body, res, req);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: body["id"], result: { ok: true } }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/mcp`,
        requests,
        headers,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

export function toolTextServer(text: string): Promise<StubServer> {
  return stubServer((body, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body["id"],
        result: { content: [{ type: "text", text }], isError: false },
      })
    );
  });
}

export function isolatedTmpdir(): string {
  return mkdtempSync(join(tmpdir(), "jc-test-"));
}
