#!/usr/bin/env node
import { homedir } from "node:os";
import { createTheme, heading } from "../theme.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { codex } from "../adapters/codex.js";
import { cursor } from "../adapters/cursor.js";
import { MalformedConfigError } from "../mcp-config.js";
import { DEFAULT_BRAND } from "../install/render.js";
import { readProjectMarker } from "../project-marker.js";
import { installSkills, uninstallSkills } from "../install/skills.js";
import { DiscoveryError, discoverDeployment } from "../discovery.js";
import { UnknownEnvironmentError, resolveStudioUrl } from "../environments.js";
const ADAPTERS = [cursor, codex];
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function parseArgs(argv) {
    const args = { scope: "project", dryRun: false, uninstall: false, print: false, skipSkills: false, help: false };
    for (const arg of argv) {
        if (arg.startsWith("--env="))
            args.environment = arg.slice("--env=".length);
        else if (arg === "--dry-run")
            args.dryRun = true;
        else if (arg === "--uninstall")
            args.uninstall = true;
        else if (arg === "--user")
            args.scope = "user";
        else if (arg === "--project")
            args.scope = "project";
        else if (arg === "--print")
            args.print = true;
        else if (arg === "--skip-skills")
            args.skipSkills = true;
        else if (arg.startsWith("--mcp-url="))
            args.mcpUrl = arg.slice("--mcp-url=".length);
        else if (arg === "--help" || arg === "-h")
            args.help = true;
        else
            args.unknown = arg;
    }
    return args;
}
const USAGE = [
    "usage: npx @jitera/connect [--env=<environment>] [options]",
    "",
    "  --env=studio-stage   staging",
    "  --env=studio-04      numbered pilot",
    "  omit --env for production",
    "",
    "  --user               write user scoped config instead of project scoped",
    "  --dry-run            report what would change without writing",
    "  --uninstall          remove the jitera server",
    "  --print              print resolved endpoints and exit",
    "  --skip-skills        write mcp config only, no skills or AGENTS.md",
    "  --mcp-url=<url>      bypass discovery, for air-gapped or self-hosted setups",
].join("\n");
const args = parseArgs(process.argv.slice(2));
if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
}
if (args.unknown) {
    process.stderr.write(`error: unrecognised argument "${args.unknown}"\n${USAGE}\n`);
    process.exit(2);
}
let studioUrl;
try {
    studioUrl = resolveStudioUrl(args.environment);
}
catch (error) {
    if (error instanceof UnknownEnvironmentError) {
        process.stderr.write(`error: ${error.message}\n`);
        process.exit(2);
    }
    throw error;
}
let mcpUrl;
let apiBaseUrl;
let brand;
if (args.mcpUrl) {
    mcpUrl = args.mcpUrl;
    apiBaseUrl = "";
    brand = DEFAULT_BRAND;
}
else {
    try {
        const deployment = await discoverDeployment({ environment: args.environment, studioUrl: process.env["JITERA_STUDIO_URL"] });
        mcpUrl = deployment.mcpUrl;
        apiBaseUrl = deployment.apiBaseUrl;
        brand = deployment.brand;
    }
    catch (error) {
        if (error instanceof DiscoveryError) {
            process.stderr.write(`error: ${error.message}\n`);
            process.exit(1);
        }
        throw error;
    }
}
if (args.print) {
    process.stdout.write(`${JSON.stringify({ mcpUrl, apiBaseUrl, studioUrl }, undefined, 2)}\n`);
    process.exit(0);
}
const context = {
    scope: args.scope,
    home: homedir(),
    cwd: process.cwd(),
    mcpUrl,
    // A committed .jitera.json pins these configs to the repo's project, which is
    // what makes a user-level key work without per-project setup.
    projectUuid: readProjectMarker(process.cwd())?.project,
    dryRun: args.dryRun,
};
const detected = ADAPTERS.filter((adapter) => adapter.detect(context));
if (detected.length === 0) {
    process.stderr.write(`error: no supported assistant detected. Looked for: ${ADAPTERS.map((a) => a.label).join(", ")}.\n` +
        `Claude Code and Codex install through their own plugin marketplaces, see the readme.\n`);
    process.exit(1);
}
const results = [];
for (const adapter of detected) {
    try {
        results.push({
            adapter,
            result: args.uninstall ? adapter.uninstall(context) : adapter.install(context),
        });
    }
    catch (error) {
        if (error instanceof MalformedConfigError) {
            process.stderr.write(`error: ${error.message}\n`);
            process.exit(1);
        }
        throw error;
    }
}
const theme = createTheme({ env: process.env, isTty: Boolean(process.stdout.isTTY) });
process.stdout.write(heading(theme, brand, args.uninstall ? "disconnect" : "connect"));
const verb = args.uninstall ? "removed from" : "written to";
for (const { adapter, result } of results) {
    process.stdout.write(`  ${result.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold(adapter.label)} ${theme.dim(`${result.changed ? verb : "already up to date in"} ${result.path}`)}\n`);
}
if (!args.skipSkills) {
    const values = { BRAND: brand };
    const targetDirs = [...new Set(detected.flatMap((adapter) => adapter.skillsDirs(context)))];
    const skills = args.uninstall
        ? uninstallSkills({ packageRoot: PACKAGE_ROOT, targetDirs, dryRun: args.dryRun })
        : installSkills({ packageRoot: PACKAGE_ROOT, targetDirs, values, dryRun: args.dryRun });
    const skillVerb = args.uninstall ? "removed from" : "written to";
    process.stdout.write(skills.changed
        ? `  ${theme.ok("✓")} ${theme.bold("Skills")} ${theme.dim(`${skills.skills.length} ${skillVerb} ${targetDirs.join(", ")}`)}\n`
        : `  ${theme.dim("–")} ${theme.bold("Skills")} ${theme.dim(`already up to date in ${targetDirs.join(", ")}`)}\n`);
}
if (args.dryRun) {
    process.stdout.write(`\n  ${theme.dim("dry run, nothing was written")}\n`);
}
else if (!args.uninstall) {
    process.stdout.write(`\n  ${theme.dim("endpoint")}  ${theme.accent(mcpUrl)}\n`);
    process.stdout.write(`  ${theme.dim("export JITERA_API_KEY=<your api key> before starting your assistant")}\n`);
    process.stdout.write(`  ${theme.dim("Optional:")} ${theme.accent("npx @jitera/connect init")} ` +
        `${theme.dim("writes committable AGENTS.md instructions at the repo root")}\n`);
}
//# sourceMappingURL=cli.js.map