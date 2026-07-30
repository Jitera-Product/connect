import { readFileSync } from "node:fs";
export function readJsonFile(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}
//# sourceMappingURL=manifest.js.map