#!/usr/bin/env node
import { UnknownEnvironmentError } from "../environments.ts";
import { configFromEnvironment, runProxy } from "../proxy.ts";

let config;
try {
  config = configFromEnvironment(process.env);
} catch (error) {
  const message = error instanceof UnknownEnvironmentError ? error.message : String(error);
  process.stderr.write(`jitera-connect proxy: ${message}\n`);
  process.exit(2);
}

if (!config.apiKey) {
  process.stderr.write(
    "jitera-connect proxy: no api key configured. Run /plugin configure jitera-connect.\n"
  );
  process.exit(2);
}

await runProxy(config, { input: process.stdin, output: process.stdout, log: process.stderr });
