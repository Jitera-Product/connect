#!/usr/bin/env node
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DiscoveryError, discoverDeployment } from "../discovery.ts";
import { UnknownEnvironmentError } from "../environments.ts";
import { loadCliSession, transportFor } from "../cli-session.ts";
import { DeviceFlowError, refreshAccessToken } from "../device-flow.ts";
import { GraphqlError, createUserApiKey, type McpAccess } from "../graphql.ts";
import { createTheme, heading } from "../theme.ts";
import { installClaudeCodePlugin } from "../install/claude-code.ts";
import { installStatusLine } from "../install/statusline.ts";
import { installSkills } from "../install/skills.ts";
import { DEFAULT_BRAND } from "../install/render.ts";
import { codex } from "../adapters/codex.ts";
import { cursor } from "../adapters/cursor.ts";
import { endWith, runCommand } from "../exit.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Args {
  environment?: string;
  access: McpAccess;
  keyName: string;
  json: boolean;
  install: boolean;
  help: boolean;
  badAccess?: string;
  unknown?: string;
}

const USAGE = [
  "usage: npx @jitera/connect new-key [--access=read|read_write] [options]",
  "",
  "Creates a fresh account-wide key and configures your assistants with it.",
  "Use it when the key you have is read-only, or you simply want a new one.",
  "",
  "Signing in again is not required: this reuses the session login stored.",
  "",
  "  --access=read_write  read + write, the default; --access=read for read-only",
  "  --name=<name>        how the key is labelled in the web app",
  "  --env=studio-06      target a pilot; omit for production",
  "  --no-install         print the key without touching any configuration",
  "  --json               print the result as json",
].join("\n");

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    access: "read_write",
    keyName: "Jitera connect",
    json: false,
    install: true,
    help: false,
  };
  for (const arg of argv) {
    if (arg === "new-key") continue;
    else if (arg.startsWith("--env=")) args.environment = arg.slice("--env=".length);
    else if (arg.startsWith("--access=")) {
      const value = arg.slice("--access=".length);
      if (value === "read" || value === "read_write") args.access = value;
      else args.badAccess = value;
    } else if (arg.startsWith("--name=")) args.keyName = arg.slice("--name=".length);
    else if (arg === "--no-install") args.install = false;
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args.unknown = arg;
  }
  return args;
}

const theme = createTheme({ env: process.env, isTty: Boolean(process.stdout.isTTY) });

function fail(message: string, code = 1): never {
  process.stderr.write(`\n  ${theme.err("error")}  ${message}\n`);
  endWith(code);
}

await runCommand(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (args.unknown) {
    process.stderr.write(`error: unrecognised argument "${args.unknown}"\n${USAGE}\n`);
    endWith(2);
  }
  if (args.badAccess !== undefined) {
    process.stderr.write(
      `error: unknown access "${args.badAccess}". Use --access=read or --access=read_write.\n`
    );
    endWith(2);
  }
  const session = loadCliSession();
  if (!session) {
    fail(
      "no stored sign-in, so there is no account to create a key for. Run " +
        `${theme.accent("npx @jitera/connect login")} first.`
    );
  }

  // The deployment this key is for is the one the session was created against.
  // Defaulting to production instead would quietly move a pilot user's
  // assistants to a different deployment as a side effect of getting a key.
  const environment = args.environment ?? session.environment;

  let brand = DEFAULT_BRAND;
  let mcpUrl = "";
  try {
    const deployment = await discoverDeployment({
      environment,
      studioUrl: process.env["JITERA_STUDIO_URL"],
    });
    brand = deployment.brand;
    mcpUrl = deployment.mcpUrl;
  } catch (error) {
    if (error instanceof UnknownEnvironmentError) fail(error.message, 2);
    if (!(error instanceof DiscoveryError)) throw error;
    // Only the assistant configuration needs the endpoint. Creating the key
    // does not, so an unreachable studio should not stop the useful half.
    if (args.install) fail(error.message);
  }

  let created;
  try {
    const transport = await transportFor(session, refreshAccessToken);
    created = await createUserApiKey({ name: args.keyName, mcpAccess: args.access }, transport);
  } catch (error) {
    if (error instanceof DeviceFlowError) {
      fail(`${error.message} Run ${theme.accent("npx @jitera/connect login")} to sign in again.`);
    }
    if (error instanceof GraphqlError) fail(error.message);
    throw error;
  }

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          apiKey: created.rawKey,
          maskedKey: created.maskedKey,
          scope: "user",
          mcpAccess: args.access,
        },
        undefined,
        2
      )}\n`
    );
  }

  if (!args.json) process.stdout.write(heading(theme, brand, "new key"));

  const access = args.access === "read" ? "read-only" : "read + write";

  if (args.install) {
    const claude = installClaudeCodePlugin({
      apiKey: created.rawKey,
      environment: environment ?? "studio",
    });
    if (!args.json) {
      process.stdout.write(
        claude.installed
          ? `  ${theme.ok("✓")} ${theme.bold("Claude Code")} ${theme.dim("now uses the new key")}\n`
          : `  ${theme.dim("–")} ${theme.bold("Claude Code")} ${theme.dim(`skipped (${claude.reason})`)}\n`
      );
      if (claude.installed) {
        const status = installStatusLine({ home: homedir() });
        if (status.installed) {
          process.stdout.write(
            `  ${theme.ok("✓")} ${theme.bold("Status line")} ${theme.dim("connection state shows in Claude Code")}\n`
          );
        }
      }
    }

    const context = {
      scope: "user" as const,
      home: homedir(),
      cwd: process.cwd(),
      mcpUrl,
      apiKey: created.rawKey,
    };
    const local = [cursor, codex].filter((adapter) => adapter.detect(context));
    for (const adapter of local) {
      const result = adapter.install(context);
      if (!args.json) {
        process.stdout.write(
          `  ${theme.ok("✓")} ${theme.bold(adapter.label)} ${theme.dim(result.path)}\n`
        );
      }
    }
    if (local.length) {
      const targetDirs = [...new Set(local.flatMap((adapter) => adapter.skillsDirs(context)))];
      installSkills({ packageRoot: PACKAGE_ROOT, targetDirs, values: { BRAND: brand } });
    }
  }

  if (args.json) return;

  process.stdout.write(
    `\n  ${theme.ok("✓")} ${theme.dim(`Created an account-wide ${access} key`)} ${theme.bold(created.maskedKey)}\n`
  );
  if (!args.install) {
    // Shown once and never again, so it has to be printed in full here.
    process.stdout.write(`\n  ${created.rawKey}\n`);
  }
  process.stdout.write(
    `\n  ${theme.dim("Restart your assistant to pick it up. The old key keeps working until you")}\n` +
      `  ${theme.dim("revoke it in the web app.")}\n`
  );
});
