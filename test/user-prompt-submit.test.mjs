import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { claimOnce, markerPath } from "../src/session-marker.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "scripts", "user-prompt-submit.mjs");

function serve(handler) {
  const server = createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}/mcp`,
        close: () => new Promise((done) => server.close(done)),
      })
    );
  });
}

function memoryServer(text) {
  return serve((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text }], isError: false },
      })
    );
  });
}

function hook(input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK], {
      env: {
        ...process.env,
        TMPDIR: env.TMPDIR ?? mkdtempSync(join(tmpdir(), "jc-hook-")),
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", () => resolve(stdout));
    child.stdin.end(JSON.stringify(input));
  });
}

test("claimOnce succeeds once and then refuses", () => {
  const root = mkdtempSync(join(tmpdir(), "jc-marker-"));
  assert.equal(claimOnce("session-a", "recall", root), true);
  assert.equal(claimOnce("session-a", "recall", root), false);
  assert.equal(claimOnce("session-b", "recall", root), true);
});

test("claimOnce refuses without a session id", () => {
  const root = mkdtempSync(join(tmpdir(), "jc-marker-"));
  assert.equal(claimOnce(undefined, "recall", root), false);
});

test("marker path does not leak the raw session id", () => {
  assert.ok(!markerPath("super-secret-session", "recall", "/tmp").includes("super-secret-session"));
});

test("the first prompt of a session injects real memory", async () => {
  const s = await memoryServer("Checkout Service (Service)\n- owns refunds");
  const out = await hook(
    { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt_text: "hi" },
    { CLAUDE_PLUGIN_OPTION_JITERA_MCP_URL: s.url, CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk" }
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(parsed.hookSpecificOutput.additionalContext, /Checkout Service/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /owns refunds/);
  await s.close();
});

test("later prompts in the same session stay silent", async () => {
  const s = await memoryServer("some memory");
  const env = {
    TMPDIR: mkdtempSync(join(tmpdir(), "jc-hook-")),
    CLAUDE_PLUGIN_OPTION_JITERA_MCP_URL: s.url,
    CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk",
  };
  const input = { hook_event_name: "UserPromptSubmit", session_id: "s2" };
  assert.notEqual((await hook(input, env)).trim(), "");
  assert.equal((await hook(input, env)).trim(), "");
  assert.equal((await hook(input, env)).trim(), "");
  await s.close();
});

test("a different session recalls again", async () => {
  const s = await memoryServer("some memory");
  const env = {
    TMPDIR: mkdtempSync(join(tmpdir(), "jc-hook-")),
    CLAUDE_PLUGIN_OPTION_JITERA_MCP_URL: s.url,
    CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk",
  };
  assert.notEqual((await hook({ session_id: "a" }, env)).trim(), "");
  assert.notEqual((await hook({ session_id: "b" }, env)).trim(), "");
  await s.close();
});

test("no credentials means silent no-op, never a broken session", async () => {
  const out = await hook(
    { session_id: "s3" },
    { CLAUDE_PLUGIN_OPTION_JITERA_MCP_URL: "", CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "" }
  );
  assert.equal(out.trim(), "");
});

test("an unreachable server degrades silently on stdout", async () => {
  const s = await memoryServer("x");
  const dead = s.url;
  await s.close();
  const out = await hook(
    { session_id: "s4" },
    { CLAUDE_PLUGIN_OPTION_JITERA_MCP_URL: dead, CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk" }
  );
  assert.equal(out.trim(), "");
});

test("empty memory injects nothing rather than an empty banner", async () => {
  const s = await memoryServer("");
  const out = await hook(
    { session_id: "s5" },
    { CLAUDE_PLUGIN_OPTION_JITERA_MCP_URL: s.url, CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk" }
  );
  assert.equal(out.trim(), "");
  await s.close();
});

test("oversized memory is truncated with a pointer to the tool", async () => {
  const s = await memoryServer("x".repeat(9000));
  const out = await hook(
    { session_id: "s6" },
    { CLAUDE_PLUGIN_OPTION_JITERA_MCP_URL: s.url, CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk" }
  );
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.ok(ctx.length < 7000, `context was ${ctx.length} chars`);
  assert.match(ctx, /truncated/);
  await s.close();
});
