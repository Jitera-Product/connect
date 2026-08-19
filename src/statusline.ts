import type { SessionStatus } from "./session-status.ts";

const GREEN = "[32m";
const YELLOW = "[33m";
const DIM = "[2m";
const RESET = "[0m";

export interface StatusLineInput {
  readonly status?: SessionStatus | undefined;
  readonly markerEnvironment?: string | undefined;
  // Explicit false means "checked, and this repo has no .jitera.json".
  // Undefined means the caller did not check, so nothing is claimed either way.
  readonly bound?: boolean | undefined;
}

function compactChars(chars: number): string {
  return chars >= 1000 ? `${(chars / 1000).toFixed(1)}k` : `${chars}ch`;
}

function compactMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function renderStatusLine({
  status,
  markerEnvironment,
  bound,
}: StatusLineInput): string {
  if (!status) return `${DIM}○${RESET} jitera`;
  if (!status.configured) return `${DIM}○${RESET} jitera · not connected`;
  // Connected, but this repository is not bound to a project, so the hooks
  // deliberately do nothing here. Carry the command that fixes it.
  if (bound === false) {
    return `${YELLOW}○${RESET} jitera · not initialised · npx @jitera/connect init`;
  }

  const dot = status.recallError ? `${YELLOW}●${RESET}` : `${GREEN}●${RESET}`;
  const parts = [`${dot} jitera`];
  if (status.environment) parts.push(status.environment);

  if (status.recallError) {
    parts.push("recall failed");
  } else if (typeof status.recallMs === "number" && typeof status.recallChars === "number") {
    parts.push(`recall ${compactChars(status.recallChars)}/${compactMs(status.recallMs)}`);
  }

  if (markerEnvironment && status.environment && markerEnvironment !== status.environment) {
    parts.push(`${YELLOW}repo wants ${markerEnvironment}${RESET}`);
  }

  return parts.join(" · ");
}
