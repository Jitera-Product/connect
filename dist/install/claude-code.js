import { spawnSync } from "node:child_process";
export const MARKETPLACE = "jitera-product/connect";
export const MARKETPLACE_NAME = "jitera";
export const PLUGIN_NAME = "jitera-connect";
// Installing shells out to `claude` several times, and each one can reach the
// network. Without a bound, an unreachable marketplace is indistinguishable
// from a slow install: it just sits there. This fails instead.
const STEP_TIMEOUT_MS = 120_000;
const defaultRunner = (command, args) => {
    const result = spawnSync(command, [...args], {
        encoding: "utf8",
        timeout: STEP_TIMEOUT_MS,
    });
    return {
        status: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
};
export function isClaudeCodeAvailable(run = defaultRunner) {
    return run("claude", ["--version"]).status === 0;
}
export function installClaudeCodePlugin({ apiKey, environment, run = defaultRunner, }) {
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
    //
    // Only a clone that was already there can be stale. `add` having just made
    // one means it is current, and refreshing it is a second network round trip
    // for a repository fetched moments ago.
    if (marketplace.status !== 0) {
        run("claude", ["plugin", "marketplace", "update", MARKETPLACE_NAME]);
    }
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
//# sourceMappingURL=claude-code.js.map