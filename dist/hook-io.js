import { readFileSync } from "node:fs";
export function readHookInput(fd = 0) {
    try {
        return JSON.parse(readFileSync(fd, "utf8"));
    }
    catch {
        return {};
    }
}
export function promptText(input) {
    return (input.prompt ?? input.prompt_text ?? "").trim();
}
export function emitContext(event, additionalContext) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }));
}
//# sourceMappingURL=hook-io.js.map