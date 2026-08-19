import test from "node:test";
import assert from "node:assert/strict";

import { claimOnce, markerPath } from "../src/session-marker.ts";
import { isolatedTmpdir, runNode, stubServer, toolTextServer } from "./helpers.ts";

const HOOK = "dist/hooks/user-prompt-submit.js";

interface HookOutput {
  readonly hookSpecificOutput: {
    readonly hookEventName: string;
    readonly additionalContext: string;
  };
}

function env(url: string, tmp?: string): NodeJS.ProcessEnv {
  return {
    ...(tmp ? { TMPDIR: tmp } : {}),
    JITERA_MCP_URL: url,
    CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk-test",
  };
}

test("claimOnce succeeds once and then refuses", () => {
  const root = isolatedTmpdir();
  assert.equal(claimOnce("session-a", "recall", root), true);
  assert.equal(claimOnce("session-a", "recall", root), false);
  assert.equal(claimOnce("session-b", "recall", root), true);
});

test("claimOnce refuses without a session id", () => {
  assert.equal(claimOnce(undefined, "recall", isolatedTmpdir()), false);
});

test("marker path does not leak the raw session id", () => {
  assert.ok(!markerPath("super-secret-session", "recall", "/tmp").includes("super-secret-session"));
});

test("the first prompt of a session injects real memory", async () => {
  const server = await toolTextServer("Checkout Service (Service)\n- owns refunds");
  const { stdout } = await runNode(HOOK, {
    input: { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt_text: "hi" },
    env: env(server.url),
  });
  const parsed = JSON.parse(stdout) as HookOutput;
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(parsed.hookSpecificOutput.additionalContext, /Checkout Service/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /owns refunds/);
  await server.close();
});

function toolCall(server: { requests: readonly Record<string, unknown>[] }, index = 0) {
  return server.requests[index]?.["params"] as {
    name: string;
    arguments: Record<string, unknown>;
  };
}

test("the gather call carries the prompt as the task", async () => {
  const server = await toolTextServer("memory");
  await runNode(HOOK, {
    input: { session_id: "s-args", prompt: "how do refunds work" },
    env: env(server.url),
  });
  const params = toolCall(server);
  assert.equal(params.name, "gather_jitera_context");
  assert.equal(params.arguments["task"], "how do refunds work");
  assert.equal(params.arguments["budget"], 6000);
  await server.close();
});

test("the prompt_text field is read too, since which one arrives was never exercised", async () => {
  const server = await toolTextServer("memory");
  await runNode(HOOK, {
    input: { session_id: "s-legacy-field", prompt_text: "how do refunds work" },
    env: env(server.url),
  });
  assert.equal(toolCall(server).arguments["task"], "how do refunds work");
  await server.close();
});

test("a deployment without the composite tool falls back to a plain recall", async () => {
  const server = await stubServer((body, res) => {
    const params = body["params"] as { name: string };
    res.writeHead(200, { "content-type": "application/json" });
    if (params.name === "gather_jitera_context") {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body["id"],
          error: { code: -32602, message: "Unknown tool: gather_jitera_context" },
        })
      );
      return;
    }
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body["id"],
        result: { content: [{ type: "text", text: "older deployment memory" }], isError: false },
      })
    );
  });

  const { stdout } = await runNode(HOOK, {
    input: { session_id: "s-fallback", prompt: "refunds" },
    env: env(server.url),
  });

  assert.equal(toolCall(server, 0).name, "gather_jitera_context");
  assert.equal(toolCall(server, 1).name, "recall_jitera_memory");
  // The blind call is deliberate on old deployments: they have no widening
  // ladder, so a query can return less than no query at all.
  assert.deepEqual(toolCall(server, 1).arguments, {});
  assert.match(
    (JSON.parse(stdout) as HookOutput).hookSpecificOutput.additionalContext,
    /older deployment memory/
  );
  await server.close();
});

test("both tools failing degrades silently rather than breaking the prompt", async () => {
  const server = await stubServer((body, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ jsonrpc: "2.0", id: body["id"], error: { message: "server is down" } })
    );
  });

  const { stdout, code } = await runNode(HOOK, {
    input: { session_id: "s-both-fail", prompt: "refunds" },
    env: env(server.url),
  });

  assert.equal(stdout.trim(), "");
  assert.equal(code, 0);
  await server.close();
});

test("later prompts in the same session stay silent", async () => {
  const server = await toolTextServer("some memory");
  const tmp = isolatedTmpdir();
  const input = { hook_event_name: "UserPromptSubmit", session_id: "s2" };
  assert.notEqual((await runNode(HOOK, { input, env: env(server.url, tmp) })).stdout.trim(), "");
  assert.equal((await runNode(HOOK, { input, env: env(server.url, tmp) })).stdout.trim(), "");
  assert.equal((await runNode(HOOK, { input, env: env(server.url, tmp) })).stdout.trim(), "");
  await server.close();
});

test("a different session recalls again", async () => {
  const server = await toolTextServer("some memory");
  const tmp = isolatedTmpdir();
  assert.notEqual(
    (await runNode(HOOK, { input: { session_id: "a" }, env: env(server.url, tmp) })).stdout.trim(),
    ""
  );
  assert.notEqual(
    (await runNode(HOOK, { input: { session_id: "b" }, env: env(server.url, tmp) })).stdout.trim(),
    ""
  );
  await server.close();
});

test("no api key means silent no-op, never a broken session", async () => {
  const { stdout, code } = await runNode(HOOK, {
    input: { session_id: "s3" },
    env: { JITERA_MCP_URL: "http://127.0.0.1:1/mcp", CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "" },
  });
  assert.equal(stdout.trim(), "");
  assert.equal(code, 0);
});

test("an unknown environment name degrades instead of crashing the prompt", async () => {
  const { stdout, stderr, code } = await runNode(HOOK, {
    input: { session_id: "s-bad-env" },
    env: {
      CLAUDE_PLUGIN_OPTION_ENVIRONMENT: "studio-banana",
      CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk-test",
    },
  });
  assert.equal(stdout.trim(), "");
  assert.match(stderr, /unknown environment/);
  assert.equal(code, 0);
});

test("an unreachable server degrades silently on stdout", async () => {
  const server = await toolTextServer("x");
  const dead = server.url;
  await server.close();
  const { stdout, code } = await runNode(HOOK, { input: { session_id: "s4" }, env: env(dead) });
  assert.equal(stdout.trim(), "");
  assert.equal(code, 0);
});

test("empty memory injects nothing rather than an empty banner", async () => {
  const server = await toolTextServer("");
  const { stdout } = await runNode(HOOK, { input: { session_id: "s5" }, env: env(server.url) });
  assert.equal(stdout.trim(), "");
  await server.close();
});

test("oversized memory is truncated with a pointer to the tool", async () => {
  const server = await toolTextServer("x".repeat(9000));
  const { stdout } = await runNode(HOOK, { input: { session_id: "s6" }, env: env(server.url) });
  const ctx = (JSON.parse(stdout) as HookOutput).hookSpecificOutput.additionalContext;
  assert.ok(ctx.length < 7000, `context was ${ctx.length} chars`);
  assert.match(ctx, /truncated/);
  await server.close();
});

test("recall carries the repo's project binding as a header", async () => {
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const server = await toolTextServer("remembered");
  const dir = isolatedTmpdir();
  writeFileSync(join(dir, ".jitera.json"), JSON.stringify({ project: "proj-9" }), "utf8");

  await runNode(HOOK, { input: { session_id: "s7", cwd: dir }, env: env(server.url) });
  await server.close();
  assert.equal(server.headers[0]?.["x-jitera-project"], "proj-9");
});

test("no repo binding sends no project header", async () => {
  const server = await toolTextServer("remembered");
  await runNode(HOOK, {
    input: { session_id: "s8", cwd: isolatedTmpdir() },
    env: env(server.url),
  });
  await server.close();
  assert.equal(server.headers[0]?.["x-jitera-project"], undefined);
});
