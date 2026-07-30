#!/usr/bin/env node
import { createInterface } from "node:readline/promises";

import { DiscoveryError, discoverDeployment } from "../discovery.ts";
import { UnknownEnvironmentError } from "../environments.ts";
import {
  DeviceFlowError,
  pollForAccessToken,
  requestDeviceAuthorization,
} from "../device-flow.ts";
import { GraphqlError, createApiKey, listProjects, type McpAccess } from "../graphql.ts";

interface Args {
  environment?: string;
  access: McpAccess;
  keyName: string;
  project?: string;
  json: boolean;
  help: boolean;
  unknown?: string;
}

const USAGE = [
  "usage: npx @jitera/connect login [--env=<environment>] [options]",
  "",
  "  --env=studio-04      target a pilot; omit for production",
  "  --project=<uuid>     skip the project prompt",
  "  --read-only          create a read-only key (default is read + write)",
  "  --name=<name>        name for the created key",
  "  --json               print the result as json",
].join("\n");

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { access: "read_write", keyName: "Jitera Connect", json: false, help: false };
  for (const arg of argv) {
    if (arg === "login") continue;
    else if (arg.startsWith("--env=")) args.environment = arg.slice("--env=".length);
    else if (arg.startsWith("--project=")) args.project = arg.slice("--project=".length);
    else if (arg.startsWith("--name=")) args.keyName = arg.slice("--name=".length);
    else if (arg === "--read-only") args.access = "read";
    else if (arg === "--json") args.json = true;
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
let brand = "Jitera";
if (!automationUrl) {
  try {
    const deployment = await discoverDeployment({
      environment: args.environment,
      studioUrl: process.env["JITERA_STUDIO_URL"],
    });
    automationUrl = deployment.automationUrl;
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

let projectUuid = args.project;
if (!projectUuid) {
  let projects;
  try {
    projects = await listProjects(transport);
  } catch (error) {
    if (error instanceof GraphqlError) fail(error.message);
    throw error;
  }

  if (projects.length === 0) fail("this account has no projects to connect to.");

  if (projects.length === 1) {
    projectUuid = projects[0]?.uuid;
    process.stdout.write(`\nProject: ${projects[0]?.name}\n`);
  } else {
    process.stdout.write("\nWhich project?\n\n");
    projects.forEach((project, index) => {
      process.stdout.write(`  ${index + 1}. ${project.name}\n`);
    });
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nNumber [1-${projects.length}]: `);
    rl.close();
    const choice = projects[Number(answer.trim()) - 1];
    if (!choice) fail(`"${answer.trim()}" is not one of the listed projects.`, 2);
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

if (args.json) {
  process.stdout.write(
    `${JSON.stringify({ apiKey: created.rawKey, maskedKey: created.maskedKey, projectUuid, mcpAccess: args.access }, undefined, 2)}\n`
  );
} else {
  process.stdout.write(`\nCreated a ${args.access === "read" ? "read-only" : "read + write"} key.\n\n`);
  process.stdout.write(`  export JITERA_API_KEY=${created.rawKey}\n\n`);
  process.stdout.write("Then run npx @jitera/connect to configure your assistants.\n");
}
