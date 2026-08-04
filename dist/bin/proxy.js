#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DiscoveryError } from "../discovery.js";
import { UnknownEnvironmentError } from "../environments.js";
import { render } from "../install/render.js";
import { configFromEnvironment, runProxy } from "../proxy.js";
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function loadInstructions(brand) {
    try {
        const template = readFileSync(join(PACKAGE_ROOT, "content", "instructions.md"), "utf8");
        return render(template, { BRAND: brand });
    }
    catch {
        return undefined;
    }
}
if (!process.env["JITERA_API_KEY"]) {
    process.stderr.write("jitera-connect proxy: no api key configured. Run /plugin configure jitera-connect.\n");
    process.exit(2);
}
let config;
try {
    config = await configFromEnvironment(process.env);
}
catch (error) {
    const known = error instanceof UnknownEnvironmentError || error instanceof DiscoveryError;
    process.stderr.write(`jitera-connect proxy: ${known ? error.message : String(error)}\n`);
    process.exit(2);
}
await runProxy({ url: config.url, apiKey: config.apiKey, instructions: loadInstructions(config.brand) }, { input: process.stdin, output: process.stdout, log: process.stderr });
//# sourceMappingURL=proxy.js.map