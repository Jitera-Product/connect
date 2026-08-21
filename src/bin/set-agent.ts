#!/usr/bin/env node
import { DiscoveryError } from "../discovery.ts";
import { UnknownEnvironmentError } from "../environments.ts";
import { loadCliSession, transportFor } from "../cli-session.ts";
import { DeviceFlowError, refreshAccessToken } from "../device-flow.ts";
import { GraphqlError, listAgents, type AgentSummary } from "../graphql.ts";
import { resolveGitRoot } from "../install/project-root.ts";
import { readProjectMarker, writeProjectMarker } from "../project-marker.ts";
import { InvalidChoiceError, SelectCancelledError, chooseManyFrom } from "../select.ts";
import { createTheme } from "../theme.ts";

interface Args {
  agents: string[];
  all: boolean;
  dryRun: boolean;
  help: boolean;
  unknown?: string;
}

const USAGE = [
  "usage: npx @jitera/connect set-agent [--agent=<id>]... [--all] [--dry-run]",
  "",
  "Chooses which agents' memory this repository reads, and records the choice",
  "in .jitera.json so every session here uses it.",
  "",
  "With no flags it lists the project's agents: space selects, enter saves.",
  "",
  "  --agent=<id>   select an agent without prompting; repeat for several",
  "  --all          read every agent, clearing any previous selection",
  "  --dry-run      show what would change without writing",
].join("\n");

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { agents: [], all: false, dryRun: false, help: false };
  for (const arg of argv) {
    if (arg === "set-agent") continue;
    else if (arg.startsWith("--agent=")) args.agents.push(arg.slice("--agent=".length));
    else if (arg === "--all") args.all = true;
    else if (arg === "--dry-run") args.dryRun = true;
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

const projectRoot = resolveGitRoot(process.cwd());
if (!projectRoot) {
  fail("this is not a git repository, and the binding belongs at a repository root.", 2);
}

// The selection lives beside the project binding, so there has to be one.
const marker = readProjectMarker(projectRoot);
if (!marker?.project) {
  fail(
    marker
      ? "this repository's .jitera.json records no project, so there are no agents to choose from. " +
          "Run: npx @jitera/connect init --project=<uuid>"
      : "this repository is not bound to a project yet. Run: npx @jitera/connect init"
  );
}

function save(ids: readonly string[], names?: readonly string[]): never {
  const written = writeProjectMarker(projectRoot as string, { agents: ids }, args.dryRun);
  const verb = args.dryRun ? "would record" : "recorded";

  if (ids.length === 0) {
    process.stdout.write(
      `\n  ${theme.ok("✓")} ${verb} ${theme.bold("every agent")} ${theme.dim(`in ${written.path}`)}\n`
    );
  } else {
    process.stdout.write(
      `\n  ${theme.ok("✓")} ${verb} ${theme.bold(`${ids.length} agent(s)`)} ${theme.dim(`in ${written.path}`)}\n`
    );
    for (const name of names ?? ids) process.stdout.write(`    ${theme.dim("·")} ${name}\n`);
  }
  if (!written.changed) {
    process.stdout.write(`  ${theme.dim("nothing changed")}\n`);
  }
  process.exit(0);
}

if (args.all) save([]);
if (args.agents.length > 0) save(args.agents);

const session = loadCliSession();
if (!session) {
  fail(
    "no stored sign-in, so the agents cannot be listed. Run `npx @jitera/connect login`, " +
      "or pass --agent=<id> if you already know the ids."
  );
}

let agents: AgentSummary[];
try {
  const transport = await transportFor(session, refreshAccessToken);
  agents = await listAgents(transport, marker.project as string);
} catch (error) {
  if (error instanceof UnknownEnvironmentError) fail(error.message, 2);
  if (
    error instanceof DiscoveryError ||
    error instanceof DeviceFlowError ||
    error instanceof GraphqlError
  ) {
    fail(`${error.message} Pass --agent=<id> to set the selection without listing.`);
  }
  if (error instanceof Error) fail(error.message);
  throw error;
}

if (agents.length === 0) {
  // An empty list is also what the server returns when the policy scope hides
  // every agent, so name both causes rather than assert the wrong one.
  fail(
    "no published agents came back for this project. Either it has none yet, or " +
      "your account cannot see them. Check the project in the studio, or pass " +
      "--agent=<id> if you know the id."
  );
}

const already = new Set(marker.agents ?? []);

let chosen: AgentSummary[];
try {
  chosen = await chooseManyFrom({
    items: agents,
    prompt: "Which agents' memory should this repository read?",
    label: (agent) => (agent.description ? `${agent.name} — ${agent.description}` : agent.name),
    theme,
    selected: (agent) => already.has(agent.id),
  });
} catch (error) {
  if (error instanceof SelectCancelledError) fail("cancelled.", 130);
  if (error instanceof InvalidChoiceError) fail(error.message, 2);
  throw error;
}

if (chosen.length === 0) {
  process.stdout.write(
    `\n  ${theme.dim("nothing selected, so this repository reads every agent.")}\n`
  );
}

save(
  chosen.map((agent) => agent.id),
  chosen.map((agent) => agent.name)
);
