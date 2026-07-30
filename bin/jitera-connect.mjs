#!/usr/bin/env node
import { UnknownEnvironmentError, resolveApiBaseUrl, resolveMcpUrl } from "../src/environments.mjs";

function parseArgs(argv) {
  const args = { env: undefined };
  for (const arg of argv) {
    if (arg.startsWith("--env=")) {
      args.env = arg.slice("--env=".length);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      args.unknown = arg;
    }
  }
  return args;
}

function usage() {
  return [
    "usage: npx @jitera/connect [--env=<environment>]",
    "",
    "  --env=studio-stage   staging",
    "  --env=studio-06      numbered pilot",
    "  omit for production",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${usage()}\n`);
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

  process.stdout.write(`${JSON.stringify({ mcpUrl, apiBaseUrl }, undefined, 2)}\n`);
}

main();
