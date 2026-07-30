#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectContentFiles, validateRepository } from "../validate.js";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const errors = validateRepository(ROOT);
if (errors.length) {
    for (const error of errors)
        process.stderr.write(`error: ${error}\n`);
    process.exit(1);
}
process.stdout.write(`validated ${collectContentFiles(ROOT).length} content file(s)\n`);
//# sourceMappingURL=validate.js.map