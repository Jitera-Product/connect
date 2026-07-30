import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
export const KNOWN_TOKENS = new Set(["BRAND", "MCP_URL", "DOCS_URL"]);
export const INSTRUCTIONS_BUDGET_CHARS = 1400;
const TOKEN_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
export function findUnknownTokens(text) {
    const unknown = new Set();
    for (const match of text.matchAll(TOKEN_RE)) {
        const token = match[1];
        if (token !== undefined && !KNOWN_TOKENS.has(token))
            unknown.add(token);
    }
    return [...unknown];
}
export function checkBudget(text, budget) {
    return { ok: text.length <= budget, length: text.length };
}
function listDir(root, dir, suffix) {
    const target = join(root, dir);
    if (!existsSync(target))
        return [];
    return readdirSync(target)
        .filter((name) => (suffix ? name.endsWith(suffix) : true))
        .map((name) => join(target, name));
}
export function collectContentFiles(root) {
    return [
        ...listDir(root, "content", ".md"),
        ...readdirSync(join(root, "skills"), { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => join(root, "skills", e.name, "SKILL.md")),
        ...listDir(root, "templates"),
    ].filter(existsSync);
}
export function validateRepository(root) {
    const errors = [];
    const instructions = join(root, "content", "instructions.md");
    if (!existsSync(instructions)) {
        errors.push("missing required file: content/instructions.md");
    }
    else {
        const budget = checkBudget(readFileSync(instructions, "utf8"), INSTRUCTIONS_BUDGET_CHARS);
        if (!budget.ok) {
            errors.push(`content/instructions.md is ${budget.length} characters, over the ` +
                `${INSTRUCTIONS_BUDGET_CHARS} character budget. This text is loaded into every ` +
                `session of every connected client, so shorten it or move detail into a skill.`);
        }
    }
    for (const file of collectContentFiles(root)) {
        const unknown = findUnknownTokens(readFileSync(file, "utf8"));
        if (unknown.length) {
            errors.push(`${file.slice(root.length + 1)} uses unknown template tokens: ${unknown.join(", ")}. ` +
                `Known tokens are ${[...KNOWN_TOKENS].join(", ")}.`);
        }
    }
    return errors;
}
//# sourceMappingURL=validate.js.map