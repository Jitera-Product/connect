#!/usr/bin/env node
import { DiscoveryError } from "../discovery.ts";
import { UnknownEnvironmentError } from "../environments.ts";
import { configFromEnvironment, runProxy } from "../proxy.ts";

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

await runProxy(config, { input: process.stdin, output: process.stdout, log: process.stderr });
