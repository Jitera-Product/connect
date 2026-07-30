#!/usr/bin/env node
import { homedir } from "node:os";

import { cursor } from "../src/adapters/cursor.mjs";
import { MalformedConfigError } from "../src/mcp-config.mjs";
import { UnknownEnvironmentError, resolveApiBaseUrl, resolveMcpUrl } from "../src/environments.mjs";

const ADAPTERS = [cursor];

function parseArgs(argv) {
  const args = { scope: "project" };
  for (const arg of argv) {
    if (arg.startsWith("--env=")) args.env = arg.slice("--env=".length);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--uninstall") args.uninstall = true;
    else if (arg === "--user") args.scope = "user";
    else if (arg === "--project") args.scope = "project";
    else if (arg === "--print") args.print = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args.unknown = arg;
  }
  return args;
}

function usage() {
  return [
    "usage: npx @jitera/connect [--env=<environment>] [options]",
    "",
    "  --env=studio-stage   staging",
    "  --env=studio-06      numbered pilot",
    "  omit --env for production",
    "",
    "  --user               write user scoped config instead of project scoped",
    "  --dry-run            report what would change without writing",
    "  --uninstall          remove the jitera server",
    "  --print              print resolved endpoints and exit",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = process.stdout;

  if (args.help) {
    out.write(`${usage()}\n`);
    return;
  }

  if (args.unknown) {
    process.stderr.write(`error: unrecognised argument "${args.unknown}"\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  let mcpUrl;
  let apiBaseUrl;
  try {
    mcpUrl = resolveMcpUrl(args.env);
    apiBaseUrl = resolveApiBaseUrl(args.env);
  } catch (error) {
    if (error instanceof UnknownEnvironmentError) {
      process.stderr.write(`error: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  if (args.print) {
    out.write(`${JSON.stringify({ mcpUrl, apiBaseUrl }, undefined, 2)}\n`);
    return;
  }

  const context = { scope: args.scope, home: homedir(), cwd: process.cwd(), mcpUrl, dryRun: args.dryRun };
  const detected = ADAPTERS.filter((adapter) => adapter.detect(context));

  if (detected.length === 0) {
    process.stderr.write(
      `error: no supported assistant detected. Looked for: ${ADAPTERS.map((a) => a.label).join(", ")}.\n` +
        `Claude Code and Codex install through their own plugin marketplaces, see the readme.\n`
    );
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const adapter of detected) {
    try {
      results.push({
        adapter,
        result: args.uninstall ? adapter.uninstall(context) : adapter.install(context),
      });
    } catch (error) {
      if (error instanceof MalformedConfigError) {
        process.stderr.write(`error: ${error.message}\n`);
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  }

  const verb = args.uninstall ? "removed from" : "written to";
  for (const { adapter, result } of results) {
    const state = result.changed ? verb : "already up to date in";
    out.write(`${adapter.label}: ${state} ${result.path}\n`);
  }

  if (args.dryRun) {
    out.write("\ndry run, nothing was written\n");
    return;
  }

  if (!args.uninstall) {
    out.write(`\nendpoint ${mcpUrl}\n`);
    out.write("export JITERA_API_KEY=<your api key> before starting your assistant\n");
  }
}

main();
