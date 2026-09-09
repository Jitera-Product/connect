#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { DiscoveryError } from "../discovery.ts";
import { UnknownEnvironmentError } from "../environments.ts";
import { render } from "../install/render.ts";
import {
  configFromEnvironment,
  markerSearchPath,
  resolveAgents,
  resolveProjectUuid,
  runProxy,
} from "../proxy.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadInstructions(brand: string): string | undefined {
  try {
    const template = readFileSync(join(PACKAGE_ROOT, "content", "instructions.md"), "utf8");
    return render(template, { BRAND: brand });
  } catch {
    return undefined;
  }
}

if (!process.env["JITERA_API_KEY"]) {
  process.stderr.write(
    "jitera-connect proxy: no api key configured. Run /plugin configure jitera-connect.\n"
  );
  process.exit(2);
}

let config;
try {
  config = await configFromEnvironment(process.env);
} catch (error) {
  const known = error instanceof UnknownEnvironmentError || error instanceof DiscoveryError;
  process.stderr.write(`jitera-connect proxy: ${known ? (error as Error).message : String(error)}\n`);
  process.exit(2);
}

const projectUuid = resolveProjectUuid(process.env);
const agents = resolveAgents(process.cwd(), process.env);

// Say what this proxy is bound to, once, on the way up. The assistant chooses
// the working directory, so a plugin can start somewhere the repository's
// .jitera.json is not - and the only symptom was every tool reporting "no
// project is selected" for a repository that is bound. Where it looked is the
// answer to that, and it belongs where the assistant already shows this
// server's output rather than in a support thread.
process.stderr.write(
  projectUuid
    ? `jitera-connect: bound to project ${projectUuid}` +
        `${agents ? `, agents ${agents.join(", ")}` : ", every agent"}\n`
    : "jitera-connect: no .jitera.json found, so tools are not scoped to a project. " +
        `Looked in: ${markerSearchPath(process.env, process.cwd()).join(", ")}\n`
);

await runProxy(
  {
    url: config.url,
    apiKey: config.apiKey,
    instructions: loadInstructions(config.brand),
    projectUuid,
    agents,
  },
  { input: process.stdin, output: process.stdout, log: process.stderr }
);
