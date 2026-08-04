#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { DiscoveryError } from "../discovery.ts";
import { UnknownEnvironmentError } from "../environments.ts";
import { render } from "../install/render.ts";
import { configFromEnvironment, runProxy } from "../proxy.ts";

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

await runProxy(
  { url: config.url, apiKey: config.apiKey, instructions: loadInstructions(config.brand) },
  { input: process.stdin, output: process.stdout, log: process.stderr }
);
