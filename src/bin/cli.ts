#!/usr/bin/env node
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { codex } from "../adapters/codex.ts";
import { cursor } from "../adapters/cursor.ts";
import type { Adapter, AdapterContext, Scope } from "../adapters/types.ts";
import { MalformedConfigError } from "../mcp-config.ts";
import { writeAgentsMd } from "../install/agents-md.ts";
import { DEFAULT_BRAND } from "../install/render.ts";
import { installSkills, uninstallSkills } from "../install/skills.ts";
import {
  UnknownEnvironmentError,
  resolveApiBaseUrl,
  resolveMcpUrl,
  resolveStudioUrl,
} from "../environments.ts";

const ADAPTERS: readonly Adapter[] = [cursor, codex];
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Args {
  environment?: string;
  scope: Scope;
  dryRun: boolean;
  uninstall: boolean;
  print: boolean;
  skipSkills: boolean;
  help: boolean;
  unknown?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { scope: "project", dryRun: false, uninstall: false, print: false, skipSkills: false, help: false };
  for (const arg of argv) {
    if (arg.startsWith("--env=")) args.environment = arg.slice("--env=".length);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--uninstall") args.uninstall = true;
    else if (arg === "--user") args.scope = "user";
    else if (arg === "--project") args.scope = "project";
    else if (arg === "--print") args.print = true;
  else if (arg === "--skip-skills") args.skipSkills = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args.unknown = arg;
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

let mcpUrl: string;
let apiBaseUrl: string;
let studioUrl: string;
try {
  mcpUrl = resolveMcpUrl(args.environment);
  apiBaseUrl = resolveApiBaseUrl(args.environment);
  studioUrl = resolveStudioUrl(args.environment);
} catch (error) {
  if (error instanceof UnknownEnvironmentError) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exit(2);
  }
  throw error;
}

if (args.print) {
  process.stdout.write(`${JSON.stringify({ mcpUrl, apiBaseUrl, studioUrl }, undefined, 2)}\n`);
  process.exit(0);
}

const context: AdapterContext = {
  scope: args.scope,
  home: homedir(),
  cwd: process.cwd(),
  mcpUrl,
  dryRun: args.dryRun,
};

const detected = ADAPTERS.filter((adapter) => adapter.detect(context));

if (detected.length === 0) {
  process.stderr.write(
    `error: no supported assistant detected. Looked for: ${ADAPTERS.map((a) => a.label).join(", ")}.\n` +
      `Claude Code and Codex install through their own plugin marketplaces, see the readme.\n`
  );
  process.exit(1);
}

const results: { adapter: Adapter; result: ReturnType<Adapter["install"]> }[] = [];
for (const adapter of detected) {
  try {
    results.push({
      adapter,
      result: args.uninstall ? adapter.uninstall(context) : adapter.install(context),
    });
  } catch (error) {
    if (error instanceof MalformedConfigError) {
      process.stderr.write(`error: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const verb = args.uninstall ? "removed from" : "written to";
for (const { adapter, result } of results) {
  process.stdout.write(
    `${adapter.label}: ${result.changed ? verb : "already up to date in"} ${result.path}\n`
  );
}

if (!args.skipSkills) {
  const values = { BRAND: DEFAULT_BRAND };
  const targetDirs = [...new Set(detected.flatMap((adapter) => adapter.skillsDirs(context)))];

  const skills = args.uninstall
    ? uninstallSkills({ packageRoot: PACKAGE_ROOT, targetDirs, dryRun: args.dryRun })
    : installSkills({ packageRoot: PACKAGE_ROOT, targetDirs, values, dryRun: args.dryRun });

  const skillVerb = args.uninstall ? "removed from" : "written to";
  process.stdout.write(
    skills.changed
      ? `Skills: ${skills.skills.length} ${skillVerb} ${targetDirs.join(", ")}\n`
      : `Skills: already up to date in ${targetDirs.join(", ")}\n`
  );

  if (!args.uninstall) {
    const agents = writeAgentsMd({
      packageRoot: PACKAGE_ROOT,
      projectRoot: context.cwd,
      values,
      dryRun: args.dryRun,
    });
    process.stdout.write(
      agents.changed
        ? `Instructions: ${agents.agents.action} block in ${agents.agentsPath}\n`
        : `Instructions: already up to date in ${agents.agentsPath}\n`
    );
  }
}

if (args.dryRun) {
  process.stdout.write("\ndry run, nothing was written\n");
} else if (!args.uninstall) {
  process.stdout.write(`\nendpoint ${mcpUrl}\n`);
  process.stdout.write("export JITERA_API_KEY=<your api key> before starting your assistant\n");
}
