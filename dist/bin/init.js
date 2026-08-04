#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DiscoveryError, discoverDeployment } from "../discovery.js";
import { UnknownEnvironmentError } from "../environments.js";
import { writeAgentsMd } from "../install/agents-md.js";
import { DEFAULT_BRAND } from "../install/render.js";
import { resolveGitRoot } from "../install/project-root.js";
import { writeProjectMarker } from "../project-marker.js";
import { createTheme } from "../theme.js";
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const USAGE = [
    "usage: npx @jitera/connect init [--env=<environment>] [--project=<uuid>] [--dry-run]",
    "",
    "Writes the shared, committable connection files at the root of the current",
    "git repository: an AGENTS.md block for assistants that read it natively, a",
    "CLAUDE.md that imports it, and a .jitera.json recording which deployment",
    "(and optionally which project) this repository belongs to. Commit all three",
    "so your team's assistants see them.",
].join("\n");
function parseArgs(argv) {
    const args = { dryRun: false, help: false };
    for (const arg of argv) {
        if (arg === "init")
            continue;
        else if (arg.startsWith("--env="))
            args.environment = arg.slice("--env=".length);
        else if (arg.startsWith("--project="))
            args.project = arg.slice("--project=".length);
        else if (arg === "--dry-run")
            args.dryRun = true;
        else if (arg === "--help" || arg === "-h")
            args.help = true;
        else
            args.unknown = arg;
    }
    return args;
}
const theme = createTheme({ env: process.env, isTty: Boolean(process.stdout.isTTY) });
const args = parseArgs(process.argv.slice(2));
if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
}
if (args.unknown) {
    process.stderr.write(`error: unrecognised argument "${args.unknown}"\n${USAGE}\n`);
    process.exit(2);
}
const projectRoot = resolveGitRoot(process.cwd());
if (!projectRoot) {
    process.stderr.write("error: not inside a git repository. Instructions written outside a repository " +
        "are invisible to assistants that read AGENTS.md from the repository root, and " +
        "an out-of-repo CLAUDE.md leaks into every project below it. Run this from " +
        "inside the repository you want to connect.\n");
    process.exit(2);
}
let brand = DEFAULT_BRAND;
try {
    const deployment = await discoverDeployment({
        environment: args.environment,
        studioUrl: process.env["JITERA_STUDIO_URL"],
    });
    brand = deployment.brand;
}
catch (error) {
    if (error instanceof UnknownEnvironmentError) {
        process.stderr.write(`error: ${error.message}\n`);
        process.exit(2);
    }
    if (!(error instanceof DiscoveryError))
        throw error;
    process.stdout.write(`  ${theme.dim(`offline, using the default brand "${brand}"`)}\n`);
}
const result = writeAgentsMd({
    packageRoot: PACKAGE_ROOT,
    projectRoot,
    values: { BRAND: brand },
    dryRun: args.dryRun,
});
process.stdout.write(`  ${result.agents.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold("AGENTS.md")} ${theme.dim(`${result.agents.action} in ${result.agentsPath}`)}\n`);
process.stdout.write(`  ${result.claude.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold("CLAUDE.md")} ${theme.dim(`${result.claude.action} in ${result.claudePath}`)}\n`);
const marker = writeProjectMarker(projectRoot, {
    environment: args.environment ?? "studio",
    ...(args.project ? { project: args.project } : {}),
}, args.dryRun);
process.stdout.write(`  ${marker.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold(".jitera.json")} ${theme.dim(`environment "${args.environment ?? "studio"}"${args.project ? `, project ${args.project}` : ""}`)}\n`);
if (args.dryRun) {
    process.stdout.write(`\n  ${theme.dim("dry run, nothing was written")}\n`);
}
else if (result.changed || marker.changed) {
    process.stdout.write(`\n  ${theme.dim("Commit these files so the whole team's assistants read them.")}\n`);
}
//# sourceMappingURL=init.js.map