import { createInterface } from "node:readline";

import { discoverDeployment } from "./discovery.ts";
import { DEFAULT_BRAND } from "./install/render.ts";
import { McpCallError, postRpc, type JsonRpcRequest } from "./mcp-client.ts";

const REQUEST_TIMEOUT_MS = 30_000;

export interface ProxyStreams {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
  readonly log: NodeJS.WritableStream;
}

export interface ProxyConfig {
  readonly url: string;
  readonly apiKey: string;
  readonly instructions?: string | undefined;
}

function isNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined || request.id === null;
}

function errorResponse(id: string | number, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

function injectInstructions(response: unknown, instructions: string): void {
  const result = (response as { result?: Record<string, unknown> } | undefined)?.result;
  if (result && typeof result === "object" && !result["instructions"]) {
    result["instructions"] = instructions;
  }
}

export async function runProxy(
  { url, apiKey, instructions }: ProxyConfig,
  { input, output, log }: ProxyStreams
): Promise<void> {
  const lines = createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      log.write(`jitera-connect proxy: ignoring unparseable line\n`);
      continue;
    }

    let response;
    try {
      response = await postRpc(request, { url, apiKey, timeoutMs: REQUEST_TIMEOUT_MS });
    } catch (error) {
      const message = error instanceof McpCallError ? error.message : String(error);
      log.write(`jitera-connect proxy: ${message}\n`);
      if (!isNotification(request)) {
        output.write(`${errorResponse(request.id as string | number, -32603, message)}\n`);
      }
      continue;
    }

    if (request.method === "initialize" && instructions) {
      injectInstructions(response, instructions);
    }

    if (!isNotification(request) && response) {
      output.write(`${JSON.stringify(response)}\n`);
    }
  }
}

export interface ProxyEnvironment extends ProxyConfig {
  readonly brand: string;
}

export async function configFromEnvironment(env: NodeJS.ProcessEnv): Promise<ProxyEnvironment> {
  const apiKey = env["JITERA_API_KEY"] ?? "";
  const override = env["JITERA_MCP_URL"] ?? "";
  if (override) return { url: override, apiKey, brand: DEFAULT_BRAND };

  const environment = env["JITERA_ENVIRONMENT"] ?? "";
  const deployment = await discoverDeployment({
    environment,
    studioUrl: env["JITERA_STUDIO_URL"],
  });
  return { url: deployment.mcpUrl, apiKey, brand: deployment.brand };
}
