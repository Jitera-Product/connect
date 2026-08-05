import type { SessionStatus } from "./session-status.ts";

const GREEN = "[32m";
const YELLOW = "[33m";
const DIM = "[2m";
const RESET = "[0m";

export interface StatusLineInput {
  readonly status?: SessionStatus | undefined;
  readonly markerEnvironment?: string | undefined;
}

function compactChars(chars: number): string {
  return chars >= 1000 ? `${(chars / 1000).toFixed(1)}k` : `${chars}ch`;
}

function compactMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function renderStatusLine({ status, markerEnvironment }: StatusLineInput): string {
  if (!status) return `${DIM}○${RESET} jitera`;
  if (!status.configured) return `${DIM}○${RESET} jitera · not connected`;

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
