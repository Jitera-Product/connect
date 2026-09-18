#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DiscoveryError, discoverDeployment } from "../discovery.js";
import { UnknownEnvironmentError } from "../environments.js";
import { isExpired, loadCliSession, saveCliSession } from "../cli-session.js";
import { DeviceFlowError, refreshAccessToken } from "../device-flow.js";
import { GraphqlError, listOrganisations, listProjects } from "../graphql.js";
import { writeAgentsMd } from "../install/agents-md.js";
import { DEFAULT_BRAND } from "../install/render.js";
import { resolveGitRoot } from "../install/project-root.js";
import { broadDirectoryReason, chooseInitTarget, isBroadDirectory } from "../install/init-target.js";
import { writeProjectMarker } from "../project-marker.js";
import { InvalidChoiceError, SelectCancelledError, chooseFrom, confirm } from "../select.js";
import { createTheme } from "../theme.js";
import { endWith, runCommand } from "../exit.js";
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const USAGE = [
    "usage: npx @jitera/connect init [--env=<environment>] [--dry-run]",
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
await runCommand(async () => {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        process.stdout.write(`${USAGE}\n`);
        endWith(0);
    }
    if (args.unknown) {
        process.stderr.write(`error: unrecognised argument "${args.unknown}"\n${USAGE}\n`);
        endWith(2);
    }
    const cwd = process.cwd();
    const target = chooseInitTarget({ cwd, gitRoot: resolveGitRoot(cwd) });
    if (target.kind === "refuse") {
        process.stderr.write(`error: ${target.reason}\n`);
        endWith(2);
    }
    // The directory init was run in is the intent. When that sits inside a larger
    // repository the root is offered, never assumed: binding a monorepo from one
    // of its packages is a choice, and the old behaviour of silently writing at
    // the root put a CLAUDE.md wherever the nearest .git happened to be - the
    // home directory, for one user - where it governed every project beneath it.
    let projectRoot = target.dir;
    if (target.repoRoot) {
        if (process.stdin.isTTY && process.stdout.isTTY) {
            process.stdout.write(`\n  ${theme.dim("this folder is inside the repository at")} ${target.repoRoot}\n`);
            const moveUp = await confirm(`  ${theme.dim("write the files there instead of here? [y/N]")} `);
            if (moveUp) {
                if (isBroadDirectory(target.repoRoot)) {
                    process.stderr.write(`error: ${broadDirectoryReason(target.repoRoot)}\n`);
                    endWith(2);
                }
                projectRoot = target.repoRoot;
            }
        }
        else {
            process.stdout.write(`  ${theme.dim(`inside the repository at ${target.repoRoot}; writing here. ` +
                "Run init from there to bind the whole repository.")}\n`);
        }
    }
    process.stdout.write(`  ${theme.dim("writing to")} ${projectRoot}\n`);
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
            endWith(2);
        }
        if (!(error instanceof DiscoveryError))
            throw error;
        process.stdout.write(`  ${theme.dim(`offline, using the default brand "${brand}"`)}\n`);
    }
    // A stored login session ("login once") lets init pick the project here, so
    // the binding lands in .jitera.json without another browser round-trip.
    const session = loadCliSession();
    let projectUuid;
    let projectName;
    if (session) {
        let accessToken = session.accessToken;
        try {
            if (isExpired(session)) {
                if (!session.refreshToken) {
                    throw new DeviceFlowError("expired_token", "the stored sign-in expired. Run login again.");
                }
                const refreshed = await refreshAccessToken({
                    automationUrl: session.automationUrl,
                    refreshToken: session.refreshToken,
                });
                accessToken = refreshed.accessToken;
                saveCliSession({
                    ...session,
                    accessToken,
                    refreshToken: refreshed.refreshToken ?? session.refreshToken,
                    expiresAt: refreshed.expiresInSeconds
                        ? Date.now() + refreshed.expiresInSeconds * 1000
                        : undefined,
                });
            }
            const transport = { automationUrl: session.automationUrl, accessToken };
            const organisations = await listOrganisations(transport);
            const organisation = organisations.length > 1
                ? await chooseFrom({
                    items: organisations,
                    prompt: "Which team?",
                    label: (org) => `${org.name ?? org.slug}${org.personal ? " (personal)" : ""}`,
                    theme,
                })
                : organisations[0];
            const projects = await listProjects(transport, organisation);
            if (projects.length === 0) {
                process.stdout.write(`  ${theme.dim("this account has no projects here")}\n`);
            }
            else {
                const choice = projects.length > 1
                    ? await chooseFrom({
                        items: projects,
                        prompt: "Which project does this repository belong to?",
                        label: (project) => project.name,
                        theme,
                    })
                    : projects[0];
                projectUuid = choice?.uuid;
                projectName = choice?.name;
                if (projectName) {
                    process.stdout.write(`  ${theme.dim("Project")}  ${projectName}\n`);
                }
            }
        }
        catch (error) {
            if (error instanceof SelectCancelledError) {
                process.stderr.write(`\n  error: cancelled.\n`);
                endWith(130);
            }
            if (error instanceof InvalidChoiceError) {
                process.stderr.write(`error: ${error.message}\n`);
                endWith(2);
            }
            if (error instanceof DeviceFlowError || error instanceof GraphqlError) {
                process.stdout.write(`  ${theme.dim(`could not list projects (${error.message})`)}\n`);
            }
            else {
                throw error;
            }
        }
    }
    else {
        process.stdout.write(`  ${theme.dim("sign in once with the login command to pick a project here")}\n`);
    }
    const result = writeAgentsMd({
        packageRoot: PACKAGE_ROOT,
        projectRoot,
        values: { BRAND: brand },
        dryRun: args.dryRun,
    });
    process.stdout.write(`  ${result.agents.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold("AGENTS.md")} ${theme.dim(`${result.agents.action} in ${result.agentsPath}`)}\n`);
    process.stdout.write(`  ${result.claude.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold("CLAUDE.md")} ${theme.dim(`${result.claude.action} in ${result.claudePath}`)}\n`);
    const environment = args.environment ?? session?.environment ?? "studio";
    const marker = writeProjectMarker(projectRoot, {
        environment,
        ...(projectUuid ? { project: projectUuid } : {}),
    }, args.dryRun);
    process.stdout.write(`  ${marker.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold(".jitera.json")} ${theme.dim(`environment "${environment}"${projectUuid ? `, project ${projectUuid}` : ""}`)}\n`);
    if (args.dryRun) {
        process.stdout.write(`\n  ${theme.dim("dry run, nothing was written")}\n`);
    }
    else if (result.changed || marker.changed) {
        process.stdout.write(`\n  ${theme.dim("Commit these files so the whole team's assistants read them.")}\n`);
    }
});
//# sourceMappingURL=init.js.map