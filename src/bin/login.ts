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
  listOrganisations,
  listProjects,
  type McpAccess,
  type Organisation,
} from "../graphql.ts";
import { installClaudeCodePlugin } from "../install/claude-code.ts";
import { writeAgentsMd } from "../install/agents-md.ts";
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

function fail(message: string, code = 1): never {
  process.stderr.write(`error: ${message}\n`);
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
process.stdout.write(`\nSign in to ${brand} to authorise this device.\n\n`);
process.stdout.write(`  Open:  ${openUrl}\n`);
process.stdout.write(`  Code:  ${authorization.userCode}\n\n`);
process.stdout.write("Waiting for approval…\n");

let accessToken;
try {
  accessToken = await pollForAccessToken({ automationUrl, authorization });
} catch (error) {
  if (error instanceof DeviceFlowError) fail(error.message);
  throw error;
}

const transport = { automationUrl, accessToken };

async function choose<T>(
  items: readonly T[],
  heading: string,
  label: (item: T) => string
): Promise<T> {
  process.stdout.write(`\n${heading}\n\n`);
  items.forEach((item, index) => {
    process.stdout.write(`  ${index + 1}. ${label(item)}\n`);
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nNumber [1-${items.length}]: `);
  rl.close();
  const picked = items[Number(answer.trim()) - 1];
  if (!picked) fail(`"${answer.trim()}" is not one of the listed options.`, 2);
  return picked as T;
}

let projectUuid = args.project;
if (!projectUuid) {
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
    process.stdout.write(`\nOrganisation: ${organisation?.name ?? organisation?.slug}\n`);
  } else if (!organisation && organisations.length > 1) {
    organisation = await choose(
      organisations,
      "Which organisation?",
      (org) => `${org.name ?? org.slug}${org.personal ? " (personal)" : ""}`
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
    process.stdout.write(`\nProject: ${manageable[0]?.name}\n`);
  } else {
    const choice = await choose(manageable, "Which project?", (project) => project.name);
    projectUuid = choice.uuid;
  }
}

let created;
try {
  created = await createApiKey(
    { projectUuid: projectUuid as string, name: args.keyName, mcpAccess: args.access },
    transport
  );
} catch (error) {
  if (error instanceof GraphqlError) fail(error.message);
  throw error;
}

if (args.install) {
  const environment = args.environment ?? "studio";
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const values = { BRAND: brand };

  const claude = installClaudeCodePlugin({ apiKey: created.rawKey, environment });
  process.stdout.write(
    claude.installed
      ? "\nClaude Code: installed and configured, key stored in your keychain.\n"
      : `\nClaude Code: skipped (${claude.reason}).\n`
  );

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
      process.stdout.write(`${adapter.label}: ${result.path}\n`);
    }
    const targetDirs = [...new Set(local.flatMap((adapter) => adapter.skillsDirs(context)))];
    installSkills({ packageRoot, targetDirs, values });
    writeAgentsMd({ packageRoot, projectRoot: context.cwd, values });
    process.stdout.write("Skills and AGENTS.md written.\n");
  }
}

if (args.json) {
  process.stdout.write(
    `${JSON.stringify({ apiKey: created.rawKey, maskedKey: created.maskedKey, projectUuid, mcpAccess: args.access }, undefined, 2)}\n`
  );
} else if (!args.install) {
  process.stdout.write(`\nCreated a ${args.access === "read" ? "read-only" : "read + write"} key.\n\n`);
  process.stdout.write(`  export JITERA_API_KEY=${created.rawKey}\n\n`);
  process.stdout.write("Then run npx @jitera/connect to configure your assistants.\n");
}
