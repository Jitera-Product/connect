import { spawnSync } from "node:child_process";

export const MARKETPLACE = "jitera-product/connect";
export const MARKETPLACE_NAME = "jitera";
export const PLUGIN_NAME = "jitera-connect";

export interface CommandRunner {
  (command: string, args: readonly string[]): { status: number; stdout: string; stderr: string };
}

const defaultRunner: CommandRunner = (command, args) => {
  const result = spawnSync(command, [...args], { encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

export function isClaudeCodeAvailable(run: CommandRunner = defaultRunner): boolean {
  return run("claude", ["--version"]).status === 0;
}

export interface ClaudeInstallOptions {
  readonly apiKey: string;
  readonly environment: string;
  readonly run?: CommandRunner;
}

export interface ClaudeInstallResult {
  readonly installed: boolean;
  readonly reason?: string;
}

export function installClaudeCodePlugin({
  apiKey,
  environment,
  run = defaultRunner,
}: ClaudeInstallOptions): ClaudeInstallResult {
  if (!isClaudeCodeAvailable(run)) {
    return { installed: false, reason: "the claude command is not on your PATH" };
  }

  const marketplace = run("claude", ["plugin", "marketplace", "add", MARKETPLACE]);
  if (marketplace.status !== 0 && !/already/i.test(marketplace.stderr)) {
    return { installed: false, reason: marketplace.stderr.trim() || "could not add the marketplace" };
  }

  // A stale clone serves an old manifest whose userConfig schema no longer
  // matches this cli, so the install below would reject --config. Best-effort:
  // the "not applied" check still catches a refresh that failed.
  run("claude", ["plugin", "marketplace", "update", MARKETPLACE_NAME]);

  // `plugin install` no-ops on an existing install without re-resolving the
  // version or re-applying --config. Removing first makes install idempotent.
  run("claude", ["plugin", "uninstall", `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);

  const install = run("claude", [
    "plugin",
    "install",
    `${PLUGIN_NAME}@${MARKETPLACE_NAME}`,
    "--config",
    `environment=${environment}`,
    "--config",
    `jitera_api_key=${apiKey}`,
  ]);

  if (install.status !== 0) {
    return {
      installed: false,
      reason: install.stderr.trim() || install.stdout.trim() || "the plugin install failed",
    };
  }

  // The cli exits 0 while rejecting --config with only a warning, which would
  // leave the mcp server unconfigurable and silently absent from sessions.
  const output = `${install.stdout}\n${install.stderr}`;
  if (/not applied/i.test(output)) {
    const warning = output
      .split("\n")
      .find((line) => /not applied/i.test(line))
      ?.trim();
    return { installed: false, reason: warning ?? "the plugin config was not applied" };
  }

  return { installed: true };
}
