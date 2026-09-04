#!/usr/bin/env node
import { DiscoveryError } from "../discovery.js";
import { UnknownEnvironmentError } from "../environments.js";
import { loadCliSession, transportFor } from "../cli-session.js";
import { DeviceFlowError, refreshAccessToken } from "../device-flow.js";
import { GraphqlError, listAgents } from "../graphql.js";
import { resolveGitRoot } from "../install/project-root.js";
import { readProjectMarker, writeProjectMarker } from "../project-marker.js";
import { InvalidChoiceError, NoInputError, SelectCancelledError, chooseManyFrom, } from "../select.js";
import { createTheme } from "../theme.js";
import { endWith, runCommand } from "../exit.js";
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
function parseArgs(argv) {
    const args = { agents: [], all: false, dryRun: false, help: false };
    for (const arg of argv) {
        if (arg === "set-agent")
            continue;
        else if (arg.startsWith("--agent=")) {
            const id = arg.slice("--agent=".length).trim();
            if (id && !args.agents.includes(id))
                args.agents.push(id);
            else if (!id)
                args.blankAgent = true;
        }
        else if (arg === "--all")
            args.all = true;
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
function fail(message, code = 1) {
    process.stderr.write(`\n  ${theme.err("error")}  ${message}\n`);
    endWith(code);
}
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
    if (args.blankAgent && args.agents.length === 0) {
        // Otherwise this wrote `"agents": [""]`, which reads back as no selection at
        // all while the command claimed to have recorded one.
        process.stderr.write(`error: --agent= needs an id\n${USAGE}\n`);
        endWith(2);
    }
    if (args.all && args.agents.length > 0) {
        process.stderr.write(`error: --all and --agent are contradictory\n${USAGE}\n`);
        endWith(2);
    }
    const projectRoot = resolveGitRoot(process.cwd());
    if (!projectRoot) {
        fail("this is not a git repository, and the binding belongs at a repository root.", 2);
    }
    // The selection lives beside the project binding, so there has to be one.
    const marker = readProjectMarker(projectRoot);
    if (!marker?.project) {
        fail(marker
            ? "this repository's .jitera.json records no project, so there are no agents to choose from. " +
                "Run: npx @jitera/connect init --project=<uuid>"
            : "this repository is not bound to a project yet. Run: npx @jitera/connect init");
    }
    function save(ids, names) {
        let written;
        try {
            written = writeProjectMarker(projectRoot, { agents: ids }, args.dryRun);
        }
        catch (error) {
            fail(`could not write .jitera.json: ${error.message}`);
        }
        const verb = args.dryRun ? "would record" : "recorded";
        if (ids.length === 0) {
            process.stdout.write(`\n  ${theme.ok("✓")} ${verb} ${theme.bold("every agent")} ${theme.dim(`in ${written.path}`)}\n`);
        }
        else {
            process.stdout.write(`\n  ${theme.ok("✓")} ${verb} ${theme.bold(`${ids.length} agent(s)`)} ${theme.dim(`in ${written.path}`)}\n`);
            for (const name of names ?? ids)
                process.stdout.write(`    ${theme.dim("·")} ${name}\n`);
        }
        if (!written.changed) {
            process.stdout.write(`  ${theme.dim("nothing changed")}\n`);
        }
        endWith(0);
    }
    if (args.all)
        save([]);
    if (args.agents.length > 0)
        save(args.agents);
    const session = loadCliSession();
    if (!session) {
        fail("no stored sign-in, so the agents cannot be listed. Run `npx @jitera/connect login`, " +
            "or pass --agent=<id> if you already know the ids.");
    }
    let agents;
    try {
        const transport = await transportFor(session, refreshAccessToken);
        agents = await listAgents(transport, marker.project);
    }
    catch (error) {
        if (error instanceof UnknownEnvironmentError)
            fail(error.message, 2);
        if (error instanceof DiscoveryError ||
            error instanceof DeviceFlowError ||
            error instanceof GraphqlError) {
            fail(`${error.message} Pass --agent=<id> to set the selection without listing.`);
        }
        if (error instanceof Error)
            fail(error.message);
        throw error;
    }
    if (agents.length === 0) {
        // An empty list is also what the server returns when the policy scope hides
        // every agent, so name both causes rather than assert the wrong one.
        fail("no published agents came back for this project. Either it has none yet, or " +
            "your account cannot see them. Check the project in the studio, or pass " +
            "--agent=<id> if you know the id.");
    }
    const already = new Set(marker.agents ?? []);
    let chosen;
    try {
        chosen = await chooseManyFrom({
            items: agents,
            prompt: "Which agents' memory should this repository read?",
            label: (agent) => (agent.description ? `${agent.name} — ${agent.description}` : agent.name),
            theme,
            selected: (agent) => already.has(agent.id),
            // Confirming an empty picker used to record "every agent", which writes
            // no `agents` key - so the file looked untouched and the run looked like
            // it had done nothing. Memory is filed per agent now, so the repository
            // needs a real answer.
            requireOne: true,
        });
    }
    catch (error) {
        if (error instanceof SelectCancelledError)
            fail("cancelled.", 130);
        if (error instanceof InvalidChoiceError)
            fail(error.message, 2);
        if (error instanceof NoInputError) {
            fail("nothing to read the answer from. Pass --agent=<id> or --all instead.", 2);
        }
        throw error;
    }
    save(chosen.map((agent) => agent.id), chosen.map((agent) => agent.name));
});
//# sourceMappingURL=set-agent.js.map