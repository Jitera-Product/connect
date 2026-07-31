import { spawnSync } from "node:child_process";

export const MARKETPLACE = "jitera-product/connect";
export const PLUGIN_NAME = "jitera-connect";

export interface CommandRunner {
  (command: string, args: readonly string[]): { status: number; stderr: string };
}

const defaultRunner: CommandRunner = (command, args) => {
  const result = spawnSync(command, [...args], { encoding: "utf8" });
  return { status: result.status ?? 1, stderr: result.stderr ?? "" };
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

  const install = run("claude", [
    "plugin",
    "install",
    PLUGIN_NAME,
    "--config",
    `environment=${environment}`,
    "--config",
    `jitera_api_key=${apiKey}`,
  ]);

  if (install.status !== 0) {
    return { installed: false, reason: install.stderr.trim() || "the plugin install failed" };
  }

  return { installed: true };
}
