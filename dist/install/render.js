const TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
export const DEFAULT_BRAND = "Jitera";
export class UnresolvedTokenError extends Error {
    name = "UnresolvedTokenError";
    tokens;
    constructor(tokens) {
        super(`content still contains unresolved template tokens: ${tokens.join(", ")}. ` +
            `Rendering with a missing value would teach the assistant a wrong brand or url.`);
        this.tokens = tokens;
    }
}
export function render(text, values) {
    const rendered = text.replace(TOKEN_PATTERN, (match, token) => {
        const value = values[token];
        return value ?? match;
    });
    const unresolved = [...new Set([...rendered.matchAll(TOKEN_PATTERN)].map((m) => m[1] ?? ""))];
    if (unresolved.length)
        throw new UnresolvedTokenError(unresolved);
    return rendered;
}
//# sourceMappingURL=render.js.map