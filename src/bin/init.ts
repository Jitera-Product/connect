#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DiscoveryError, discoverDeployment } from "../discovery.ts";
import { UnknownEnvironmentError } from "../environments.ts";
import { isExpired, loadCliSession, saveCliSession } from "../cli-session.ts";
import { DeviceFlowError, refreshAccessToken } from "../device-flow.ts";
import { GraphqlError, listOrganisations, listProjects } from "../graphql.ts";
import { writeAgentsMd } from "../install/agents-md.ts";
import { DEFAULT_BRAND } from "../install/render.ts";
import { resolveGitRoot } from "../install/project-root.ts";
import { writeProjectMarker } from "../project-marker.ts";
import { InvalidChoiceError, SelectCancelledError, chooseFrom } from "../select.ts";
import { createTheme } from "../theme.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Args {
  environment?: string;
  project?: string;
  dryRun: boolean;
  help: boolean;
  unknown?: string;
}

const USAGE = [
  "usage: npx @jitera/connect init [--env=<environment>] [--project=<uuid>] [--dry-run]",
  "",
  "Writes the shared, committable connection files at the root of the current",
  "git repository: an AGENTS.md block for assistants that read it natively, a",
  "CLAUDE.md that imports it, and a .jitera.json recording which deployment",
  "(and optionally which project) this repository belongs to. Commit all three",
  "so your team's assistants see them.",
].join("\n");

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === "init") continue;
    else if (arg.startsWith("--env=")) args.environment = arg.slice("--env=".length);
    else if (arg.startsWith("--project=")) args.project = arg.slice("--project=".length);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args.unknown = arg;
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
  process.stderr.write(
    "error: not inside a git repository. Instructions written outside a repository " +
      "are invisible to assistants that read AGENTS.md from the repository root, and " +
      "an out-of-repo CLAUDE.md leaks into every project below it. Run this from " +
      "inside the repository you want to connect.\n"
  );
  process.exit(2);
}

let brand = DEFAULT_BRAND;
try {
  const deployment = await discoverDeployment({
    environment: args.environment,
    studioUrl: process.env["JITERA_STUDIO_URL"],
  });
  brand = deployment.brand;
} catch (error) {
  if (error instanceof UnknownEnvironmentError) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(2);
  }
  if (!(error instanceof DiscoveryError)) throw error;
  process.stdout.write(`  ${theme.dim(`offline, using the default brand "${brand}"`)}\n`);
}

// A stored login session ("login once") lets init pick the project here, so
// the binding lands in .jitera.json without another browser round-trip.
const session = loadCliSession();
let projectUuid = args.project;
let projectName: string | undefined;

if (!projectUuid && session) {
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
    const organisation =
      organisations.length > 1
        ? await chooseFrom({
            items: organisations,
            prompt: "Which organisation?",
            label: (org) => `${org.name ?? org.slug}${org.personal ? " (personal)" : ""}`,
            theme,
          })
        : organisations[0];

    const projects = await listProjects(transport, organisation);
    if (projects.length === 0) {
      process.stdout.write(
        `  ${theme.dim("this account has no projects here; pass --project=<uuid> to bind one")}\n`
      );
    } else {
      const choice =
        projects.length > 1
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
  } catch (error) {
    if (error instanceof SelectCancelledError) {
      process.stderr.write(`\n  error: cancelled.\n`);
      process.exit(130);
    }
    if (error instanceof InvalidChoiceError) {
      process.stderr.write(`error: ${error.message}\n`);
      process.exit(2);
    }
    if (error instanceof DeviceFlowError || error instanceof GraphqlError) {
      process.stdout.write(
        `  ${theme.dim(`could not list projects (${error.message}); pass --project=<uuid>`)}\n`
      );
    } else {
      throw error;
    }
  }
} else if (!projectUuid) {
  process.stdout.write(
    `  ${theme.dim("sign in once with the login command to pick a project here, or pass --project=<uuid>")}\n`
  );
}

const result = writeAgentsMd({
  packageRoot: PACKAGE_ROOT,
  projectRoot,
  values: { BRAND: brand },
  dryRun: args.dryRun,
});

process.stdout.write(
  `  ${result.agents.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold("AGENTS.md")} ${theme.dim(
    `${result.agents.action} in ${result.agentsPath}`
  )}\n`
);
process.stdout.write(
  `  ${result.claude.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold("CLAUDE.md")} ${theme.dim(
    `${result.claude.action} in ${result.claudePath}`
  )}\n`
);

const environment = args.environment ?? session?.environment ?? "studio";
const marker = writeProjectMarker(
  projectRoot,
  {
    environment,
    ...(projectUuid ? { project: projectUuid } : {}),
  },
  args.dryRun
);
process.stdout.write(
  `  ${marker.changed ? theme.ok("✓") : theme.dim("–")} ${theme.bold(".jitera.json")} ${theme.dim(
    `environment "${environment}"${projectUuid ? `, project ${projectUuid}` : ""}`
  )}\n`
);

if (args.dryRun) {
  process.stdout.write(`\n  ${theme.dim("dry run, nothing was written")}\n`);
} else if (result.changed || marker.changed) {
  process.stdout.write(
    `\n  ${theme.dim("Commit these files so the whole team's assistants read them.")}\n`
  );
}
