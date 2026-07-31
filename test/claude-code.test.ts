import test from "node:test";
import assert from "node:assert/strict";

import {
  MARKETPLACE,
  PLUGIN_NAME,
  installClaudeCodePlugin,
  isClaudeCodeAvailable,
  type CommandRunner,
} from "../src/install/claude-code.ts";

interface Invocation {
  readonly command: string;
  readonly args: readonly string[];
}

function runner(
  outcomes: Record<string, { status: number; stderr?: string }> = {}
): { run: CommandRunner; calls: Invocation[] } {
  const calls: Invocation[] = [];
  const run: CommandRunner = (command, args) => {
    calls.push({ command, args });
    const key = args[0] === "--version" ? "version" : args.slice(0, 3).join(" ");
    const outcome = outcomes[key] ?? { status: 0 };
    return { status: outcome.status, stderr: outcome.stderr ?? "" };
  };
  return { run, calls };
}

test("claude code is detected by asking the binary for its version", () => {
  const { run, calls } = runner();
  assert.equal(isClaudeCodeAvailable(run), true);
  assert.deepEqual(calls[0], { command: "claude", args: ["--version"] });
});

test("a missing claude binary is reported, not treated as a failure to install", () => {
  const { run } = runner({ version: { status: 127, stderr: "command not found" } });
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  assert.equal(result.installed, false);
  assert.match(result.reason ?? "", /not on your PATH/);
});

test("the marketplace is added before the plugin is installed", () => {
  const { run, calls } = runner();
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio-05", run });

  assert.equal(result.installed, true);
  const commands = calls.map((c) => c.args.join(" "));
  assert.ok(commands.some((c) => c.includes(`marketplace add ${MARKETPLACE}`)));
  const install = calls.find((c) => c.args[1] === "install");
  assert.ok(install);
  assert.equal(install.args[2], PLUGIN_NAME);
});

test("the environment and key are passed as config, never typed by the user", () => {
  const { run, calls } = runner();
  installClaudeCodePlugin({ apiKey: "sk-secret", environment: "studio-05", run });
  const install = calls.find((c) => c.args[1] === "install");
  const args = install?.args.join(" ") ?? "";
  assert.match(args, /--config environment=studio-05/);
  assert.match(args, /--config jitera_api_key=sk-secret/);
});

test("an already-added marketplace is not treated as an error", () => {
  const { run } = runner({
    "plugin marketplace add": { status: 1, stderr: "marketplace already exists" },
  });
  assert.equal(installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run }).installed, true);
});

test("a genuine marketplace failure stops before installing", () => {
  const { run, calls } = runner({
    "plugin marketplace add": { status: 1, stderr: "network unreachable" },
  });
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  assert.equal(result.installed, false);
  assert.match(result.reason ?? "", /network unreachable/);
  assert.ok(!calls.some((c) => c.args[1] === "install"), "must not install after a failed add");
});

test("an install failure surfaces the reason rather than claiming success", () => {
  const { run } = runner({
    "plugin install jitera-connect": { status: 1, stderr: "plugin validation failed" },
  });
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  assert.equal(result.installed, false);
  assert.match(result.reason ?? "", /plugin validation failed/);
});
