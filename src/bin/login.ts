#!/usr/bin/env node
import { createInterface } from "node:readline/promises";

import { DiscoveryError, discoverDeployment } from "../discovery.ts";
import { UnknownEnvironmentError } from "../environments.ts";
import {
  DeviceFlowError,
  pollForAccessToken,
  requestDeviceAuthorization,
} from "../device-flow.ts";
import {
  GraphqlError,
  createApiKey,
  createUserApiKey,
  isAuthenticationFailure,
  listOrganisations,
  listProjects,
  type CreatedApiKey,
  type McpAccess,
  type Organisation,
} from "../graphql.ts";
import { saveCliSession } from "../cli-session.ts";
import { createTheme, heading, startSpinner } from "../theme.ts";
import { SelectCancelledError, interactiveSelect } from "../select.ts";
import { installClaudeCodePlugin } from "../install/claude-code.ts";
import { installStatusLine } from "../install/statusline.ts";
import { installSkills } from "../install/skills.ts";
import { codex } from "../adapters/codex.ts";
import { cursor } from "../adapters/cursor.ts";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface Args {
  environment?: string;
  access: McpAccess;
  keyName: string;
  organisation?: string;
  project?: string;
  json: boolean;
  install: boolean;
  help: boolean;
  unknown?: string;
}

const USAGE = [
  "usage: npx @jitera/connect login [--env=<environment>] [options]",
  "",
  "  --env=studio-04      target a pilot; omit for production",
  "  --org=<slug>         skip the organisation prompt",
  "  --project=<uuid>     skip the organisation and project prompts",
  "  --read-only          create a read-only key (default is read + write)",
  "  --name=<name>        name for the created key",
  "  --json               print the result as json",
  "  --install            configure your assistants with the new key",
].join("\n");

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { access: "read_write", keyName: "Jitera Connect", json: false, install: false, help: false };
  for (const arg of argv) {
    if (arg === "login") continue;
    else if (arg.startsWith("--env=")) args.environment = arg.slice("--env=".length);
    else if (arg.startsWith("--org=")) args.organisation = arg.slice("--org=".length);
    else if (arg.startsWith("--project=")) args.project = arg.slice("--project=".length);
    else if (arg.startsWith("--name=")) args.keyName = arg.slice("--name=".length);
    else if (arg === "--read-only") args.access = "read";
    else if (arg === "--json") args.json = true;
    else if (arg === "--install") args.install = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args.unknown = arg;
  }
  return args;
}

const theme = createTheme({ env: process.env, isTty: Boolean(process.stdout.isTTY) });

function fail(message: string, code = 1): never {
  process.stderr.write(`\n  ${theme.err("error")}  ${message}\n`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
if (args.unknown) {
  process.stderr.write(`error: unrecognised argument "${args.unknown}"\n${USAGE}\n`);
  process.exit(2);
}

let automationUrl = process.env["JITERA_AUTOMATION_URL"] ?? "";
let mcpUrl = process.env["JITERA_MCP_URL"] ?? "";
let brand = "Jitera";
if (!automationUrl) {
  try {
    const deployment = await discoverDeployment({
      environment: args.environment,
      studioUrl: process.env["JITERA_STUDIO_URL"],
    });
    automationUrl = deployment.automationUrl;
    mcpUrl = mcpUrl || deployment.mcpUrl;
    brand = deployment.brand;
  } catch (error) {
    if (error instanceof UnknownEnvironmentError) fail(error.message, 2);
    if (error instanceof DiscoveryError) fail(error.message);
    throw error;
  }
}
if (!automationUrl) {
  fail("this deployment did not advertise an automation url, so sign-in cannot continue.");
}

let authorization;
try {
  authorization = await requestDeviceAuthorization({ automationUrl });
} catch (error) {
  if (error instanceof DeviceFlowError) fail(error.message);
  throw error;
}

const openUrl = authorization.verificationUriComplete ?? authorization.verificationUri;
process.stdout.write(heading(theme, brand, "connect"));
process.stdout.write(`\n  ${theme.dim("Sign in to authorise this device.")}\n\n`);
process.stdout.write(`  ${theme.dim("Open")}  ${theme.accent(openUrl)}\n`);
process.stdout.write(`  ${theme.dim("Code")}  ${theme.bold(authorization.userCode)}\n\n`);

const spinner = startSpinner({
  theme,
  label: "Waiting for approval…",
  write: (chunk) => process.stdout.write(chunk),
  animate: Boolean(process.stdout.isTTY),
});

let tokens;
try {
  tokens = await pollForAccessToken({ automationUrl, authorization });
  spinner.stop(theme.ok("Approved."));
} catch (error) {
  spinner.stop();
  if (error instanceof DeviceFlowError) fail(error.message);
  throw error;
}

// The stored session is what lets `init` list projects later without another
// browser round-trip: login once, bind repos as often as needed.
saveCliSession({
  automationUrl,
  environment: args.environment,
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  expiresAt: tokens.expiresInSeconds ? Date.now() + tokens.expiresInSeconds * 1000 : undefined,
});

const transport = { automationUrl, accessToken: tokens.accessToken };

async function choose<T>(
  items: readonly T[],
  prompt: string,
  label: (item: T) => string
): Promise<T> {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    try {
      return await interactiveSelect({
        items,
        prompt,
        label,
        theme,
        input: process.stdin,
        output: process.stdout,
      });
    } catch (error) {
      if (error instanceof SelectCancelledError) fail("cancelled.", 130);
      throw error;
    }
  }

  process.stdout.write(`\n  ${theme.bold(prompt)}\n\n`);
  items.forEach((item, index) => {
    process.stdout.write(`    ${theme.accent(String(index + 1).padStart(2))}  ${label(item)}\n`);
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n  ${theme.dim(`Number [1-${items.length}]`)} `);
  rl.close();
  const picked = items[Number(answer.trim()) - 1];
  if (!picked) fail(`"${answer.trim()}" is not one of the listed options.`, 2);
  return picked as T;
}

let created: CreatedApiKey | undefined;
let keyScope: "user" | "project" = "user";
let projectUuid = args.project;

// User-level first: one key for every project the account can access. Older
// deployments reject the projectless params, and we fall back to project keys.
if (!projectUuid) {
  try {
    created = await createUserApiKey({ name: args.keyName, mcpAccess: args.access }, transport);
  } catch (error) {
    if (!(error instanceof GraphqlError)) throw error;
    if (isAuthenticationFailure(error)) fail(error.message);
    process.stdout.write(
      `\n  ${theme.dim("This deployment issues project keys only — choosing a project.")}\n`
    );
  }
}

if (!created && !projectUuid) {
  const organisations = await listOrganisations(transport);
  const named = args.organisation
    ? organisations.find((org) => org.slug === args.organisation)
    : undefined;

  if (args.organisation && !named) {
    fail(
      organisations.length
        ? `no organisation with slug "${args.organisation}". Available: ${organisations
            .map((org) => org.slug)
            .join(", ")}`
        : `no organisation with slug "${args.organisation}".`
    );
  }

  let organisation: Organisation | undefined = named;
  if (!organisation && organisations.length === 1) {
    organisation = organisations[0];
    process.stdout.write(
      `\n  ${theme.dim("Organisation")}  ${organisation?.name ?? organisation?.slug}\n`
    );
  } else if (!organisation && organisations.length > 1) {
    organisation = await choose(
      organisations,
      "Which organisation?",
      (org) => `${org.name ?? org.slug}${org.personal ? " (personal)" : ""}`
    );
    process.stdout.write(
      `\n  ${theme.dim("Organisation")}  ${organisation.name ?? organisation.slug}\n`
    );
  }

  let projects;
  try {
    projects = await listProjects(transport, organisation);
  } catch (error) {
    if (error instanceof GraphqlError) fail(error.message);
    throw error;
  }

  const where = organisation ? ` in ${organisation.name ?? organisation.slug}` : "";
  if (projects.length === 0) fail(`this account has no projects to connect to${where}.`);

  const manageable = projects.filter((project) => project.canManageApiKey);
  if (manageable.length === 0) {
    fail(
      `none of the ${projects.length} project(s)${where} allow you to create an API key. ` +
        "You need project-edit rights on a project whose plan includes API keys — " +
        "ask an owner or admin, or pick a different organisation."
    );
  }

  if (manageable.length === 1) {
    projectUuid = manageable[0]?.uuid;
    process.stdout.write(`  ${theme.dim("Project")}       ${manageable[0]?.name}\n`);
  } else {
    const choice = await choose(manageable, "Which project?", (project) => project.name);
    projectUuid = choice.uuid;
    process.stdout.write(`  ${theme.dim("Project")}       ${choice.name}\n`);
  }
}

if (!created) {
  keyScope = "project";
  try {
    created = await createApiKey(
      { projectUuid: projectUuid as string, name: args.keyName, mcpAccess: args.access },
      transport
    );
  } catch (error) {
    if (error instanceof GraphqlError) fail(error.message);
    throw error;
  }
}

if (args.install) {
  const environment = args.environment ?? "studio";
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const values = { BRAND: brand };

  const claude = installClaudeCodePlugin({ apiKey: created.rawKey, environment });
  process.stdout.write(
    claude.installed
      ? `\n  ${theme.ok("✓")} ${theme.bold("Claude Code")} ${theme.dim("configured, key stored in your keychain")}\n`
      : `\n  ${theme.dim("–")} ${theme.bold("Claude Code")} ${theme.dim(`skipped (${claude.reason})`)}\n`
  );
  if (!claude.installed) {
    process.stdout.write(
      `    ${theme.dim("Run /plugin inside Claude Code to install and configure jitera-connect manually.")}\n`
    );
  } else {
    const status = installStatusLine({ home: homedir() });
    process.stdout.write(
      status.installed
        ? `  ${theme.ok("✓")} ${theme.bold("Status line")} ${theme.dim("connection state shows at the bottom of Claude Code")}\n`
        : `  ${theme.dim("–")} ${theme.bold("Status line")} ${theme.dim(`skipped (${status.reason})`)}\n`
    );
  }

  const context = {
    scope: "user" as const,
    home: homedir(),
    cwd: process.cwd(),
    mcpUrl,
    apiKey: created.rawKey,
  };
  const local = [cursor, codex].filter((adapter) => adapter.detect(context));

  if (local.length) {
    for (const adapter of local) {
      const result = adapter.install(context);
      process.stdout.write(
        `  ${theme.ok("✓")} ${theme.bold(adapter.label)} ${theme.dim(result.path)}\n`
      );
    }
    const targetDirs = [...new Set(local.flatMap((adapter) => adapter.skillsDirs(context)))];
    installSkills({ packageRoot, targetDirs, values });
    process.stdout.write(`  ${theme.ok("✓")} ${theme.dim("Skills written")}\n`);
  }

  process.stdout.write(
    `\n  ${theme.dim("Optional:")} ${theme.accent("npx @jitera/connect init")} ` +
      `${theme.dim("writes committable AGENTS.md instructions at a repo root")}\n`
  );
}

if (args.json) {
  process.stdout.write(
    `${JSON.stringify(
      {
        apiKey: created.rawKey,
        maskedKey: created.maskedKey,
        scope: keyScope,
        projectUuid: projectUuid ?? null,
        mcpAccess: args.access,
      },
      undefined,
      2
    )}\n`
  );
} else if (!args.install) {
  const access = args.access === "read" ? "read-only" : "read + write";
  process.stdout.write(
    `\n  ${theme.ok("✓")} ${theme.dim(
      keyScope === "user"
        ? `Created a user-level ${access} key. It works on every project your account can access.`
        : `Created a ${access} key.`
    )}\n\n`
  );
  process.stdout.write(`  export JITERA_API_KEY=${theme.bold(created.rawKey)}\n\n`);
  process.stdout.write(
    `  ${theme.dim("Then run")} ${theme.accent("npx @jitera/connect")} ${theme.dim("to configure your assistants.")}\n`
  );
  if (keyScope === "user") {
    process.stdout.write(
      `  ${theme.dim("Bind each repo to its project with")} ${theme.accent("npx @jitera/connect init")}\n`
    );
  }
}
