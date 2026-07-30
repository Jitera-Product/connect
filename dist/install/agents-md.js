import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "./render.js";
export const BEGIN_MARKER = "<!-- BEGIN JITERA CONNECT -->";
export const END_MARKER = "<!-- END JITERA CONNECT -->";
const CLAUDE_IMPORT = "@AGENTS.md";
export function upsertBlock(existing, block) {
    const trimmedBlock = block.trim();
    if (existing === undefined || existing.trim() === "") {
        return { content: `${trimmedBlock}\n`, changed: true, action: "created" };
    }
    const start = existing.indexOf(BEGIN_MARKER);
    const end = existing.indexOf(END_MARKER);
    if (start !== -1 && end !== -1 && end > start) {
        const before = existing.slice(0, start);
        const after = existing.slice(end + END_MARKER.length);
        const content = `${before}${trimmedBlock}${after}`;
        return {
            content,
            changed: content !== existing,
            action: content === existing ? "unchanged" : "replaced",
        };
    }
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    return { content: `${existing}${separator}${trimmedBlock}\n`, changed: true, action: "appended" };
}
export function ensureClaudeImport(existing) {
    if (existing === undefined || existing.trim() === "") {
        return { content: `${CLAUDE_IMPORT}\n`, changed: true, action: "created" };
    }
    if (existing.includes(CLAUDE_IMPORT)) {
        return { content: existing, changed: false, action: "unchanged" };
    }
    return {
        content: `${CLAUDE_IMPORT}\n\n${existing.replace(/^\n+/, "")}`,
        changed: true,
        action: "appended",
    };
}
function readIfPresent(path) {
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}
export function writeAgentsMd({ packageRoot, projectRoot, values, dryRun = false, }) {
    const template = readFileSync(join(packageRoot, "templates", "AGENTS.md.tmpl"), "utf8");
    const block = render(template, values);
    const agentsPath = join(projectRoot, "AGENTS.md");
    const claudePath = join(projectRoot, "CLAUDE.md");
    const agents = upsertBlock(readIfPresent(agentsPath), block);
    const claude = ensureClaudeImport(readIfPresent(claudePath));
    if (!dryRun) {
        if (agents.changed)
            writeFileSync(agentsPath, agents.content, "utf8");
        if (claude.changed)
            writeFileSync(claudePath, claude.content, "utf8");
    }
    return { agentsPath, claudePath, agents, claude, changed: agents.changed || claude.changed };
}
//# sourceMappingURL=agents-md.js.map