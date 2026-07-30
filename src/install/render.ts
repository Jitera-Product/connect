const TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export const DEFAULT_BRAND = "Jitera";

export interface RenderValues {
  readonly BRAND?: string;
  readonly MCP_URL?: string;
  readonly DOCS_URL?: string;
}

export class UnresolvedTokenError extends Error {
  override readonly name = "UnresolvedTokenError";
  readonly tokens: readonly string[];

  constructor(tokens: readonly string[]) {
    super(
      `content still contains unresolved template tokens: ${tokens.join(", ")}. ` +
        `Rendering with a missing value would teach the assistant a wrong brand or url.`
    );
    this.tokens = tokens;
  }
}

export function render(text: string, values: RenderValues): string {
  const rendered = text.replace(TOKEN_PATTERN, (match, token: string) => {
    const value = (values as Record<string, string | undefined>)[token];
    return value ?? match;
  });

  const unresolved = [...new Set([...rendered.matchAll(TOKEN_PATTERN)].map((m) => m[1] ?? ""))];
  if (unresolved.length) throw new UnresolvedTokenError(unresolved);

  return rendered;
}
