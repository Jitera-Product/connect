import test from "node:test";
import assert from "node:assert/strict";

import {
  MARKETPLACE,
  MARKETPLACE_NAME,
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
  outcomes: Record<string, { status: number; stdout?: string; stderr?: string }> = {}
): { run: CommandRunner; calls: Invocation[] } {
  const calls: Invocation[] = [];
  const run: CommandRunner = (command, args) => {
    calls.push({ command, args });
    const key = args[0] === "--version" ? "version" : args.slice(0, 3).join(" ");
    const outcome = outcomes[key] ?? { status: 0 };
    return { status: outcome.status, stdout: outcome.stdout ?? "", stderr: outcome.stderr ?? "" };
  };
  return { run, calls };
}

const INSTALL_KEY = `plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

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
  assert.equal(install.args[2], `${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
});

const ALREADY_ADDED = {
  "plugin marketplace add": { status: 1, stderr: "marketplace already exists" },
};

test("an existing marketplace clone is refreshed so the manifest matches this cli", () => {
  const { run, calls } = runner(ALREADY_ADDED);
  installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  const commands = calls.map((c) => c.args.join(" "));
  const update = commands.findIndex((c) => c === `plugin marketplace update ${MARKETPLACE_NAME}`);
  const install = commands.findIndex((c) => c.startsWith("plugin install"));
  assert.ok(update !== -1, "an existing clone can be stale, so it must be refreshed");
  assert.ok(update < install, "must refresh before installing");
});

test("a marketplace just added is not fetched a second time", () => {
  // `add` cloned it moments ago, so refreshing is a network round trip for a
  // repository that cannot be stale yet. Installing is slow enough already.
  const { run, calls } = runner();
  installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  const commands = calls.map((c) => c.args.join(" "));
  assert.equal(commands.includes(`plugin marketplace update ${MARKETPLACE_NAME}`), false);
  assert.ok(commands.some((c) => c.startsWith("plugin install")), "still installs");
});

test("a failed marketplace refresh does not stop the install", () => {
  const { run } = runner({
    ...ALREADY_ADDED,
    "plugin marketplace update": { status: 1, stderr: "temporarily offline" },
  });
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  assert.equal(result.installed, true);
});

test("an existing install is removed first so version and config are re-resolved", () => {
  const { run, calls } = runner();
  installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  const commands = calls.map((c) => c.args.join(" "));
  const uninstall = commands.findIndex(
    (c) => c === `plugin uninstall ${PLUGIN_NAME}@${MARKETPLACE_NAME}`
  );
  const install = commands.findIndex((c) => c.startsWith("plugin install"));
  assert.ok(uninstall !== -1, "must uninstall any existing copy");
  assert.ok(uninstall < install, "must uninstall before installing");
});

test("uninstalling nothing is not an error", () => {
  const { run } = runner({
    "plugin uninstall jitera-connect@jitera": { status: 1, stderr: "not installed" },
  });
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  assert.equal(result.installed, true);
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
    [INSTALL_KEY]: { status: 1, stderr: "plugin validation failed" },
  });
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  assert.equal(result.installed, false);
  assert.match(result.reason ?? "", /plugin validation failed/);
});

test("a rejected config is a failure even when the exit code is zero", () => {
  const { run } = runner({
    [INSTALL_KEY]: {
      status: 0,
      stdout:
        '✔ Plugin installed\n⚠ Installed, but --config not applied: --config key "environment" ' +
        "isn't declared in this plugin's userConfig.",
    },
  });
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  assert.equal(result.installed, false);
  assert.match(result.reason ?? "", /not applied/);
});

test("a config warning on stderr is caught the same way", () => {
  const { run } = runner({
    [INSTALL_KEY]: { status: 0, stderr: "⚠ Installed, but --config not applied: bad key" },
  });
  const result = installClaudeCodePlugin({ apiKey: "sk", environment: "studio", run });
  assert.equal(result.installed, false);
  assert.match(result.reason ?? "", /not applied/);
});
