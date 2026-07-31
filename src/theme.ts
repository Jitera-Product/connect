const BRAND_RGB: readonly [number, number, number] = [6, 25, 255];
const ACCENT_RGB: readonly [number, number, number] = [25, 179, 227];

export type ColourLevel = 0 | 1 | 2;

export interface ColourEnvironment {
  readonly env: NodeJS.ProcessEnv;
  readonly isTty: boolean;
}

export function detectLevel({ env, isTty }: ColourEnvironment): ColourLevel {
  if (env["NO_COLOR"] !== undefined && env["NO_COLOR"] !== "") return 0;

  const forced = env["FORCE_COLOR"];
  if (forced !== undefined && forced !== "") {
    if (forced === "0" || forced === "false") return 0;
    return /truecolor|24bit/i.test(env["COLORTERM"] ?? "") ? 2 : 1;
  }

  if (!isTty) return 0;
  if ((env["TERM"] ?? "") === "dumb") return 0;
  if (/truecolor|24bit/i.test(env["COLORTERM"] ?? "")) return 2;
  return 1;
}

export interface Theme {
  readonly level: ColourLevel;
  readonly mark: string;
  brand(text: string): string;
  accent(text: string): string;
  bold(text: string): string;
  dim(text: string): string;
  ok(text: string): string;
  err(text: string): string;
}

function wrap(level: ColourLevel, open: string, text: string): string {
  return level === 0 ? text : `\u001b[${open}m${text}\u001b[0m`;
}

function rgb(level: ColourLevel, [r, g, b]: readonly [number, number, number], fallback: string): string {
  return level === 2 ? `38;2;${r};${g};${b}` : fallback;
}

export function createTheme(environment: ColourEnvironment): Theme {
  const level = detectLevel(environment);
  const brandCode = rgb(level, BRAND_RGB, "34");
  const accentCode = rgb(level, ACCENT_RGB, "36");

  return {
    level,
    mark:
      level === 0
        ? "▶▶"
        : `${wrap(level, brandCode, "▶")}${wrap(level, accentCode, "▶")}`,
    brand: (text) => wrap(level, brandCode, text),
    accent: (text) => wrap(level, accentCode, text),
    bold: (text) => wrap(level, "1", text),
    dim: (text) => wrap(level, "2", text),
    ok: (text) => wrap(level, "32", text),
    err: (text) => wrap(level, "31", text),
  };
}

export function heading(theme: Theme, brand: string, subtitle: string): string {
  return `\n  ${theme.mark}  ${theme.bold(brand)} ${theme.dim(subtitle)}\n`;
}

export interface Spinner {
  stop(finalLine?: string): void;
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface SpinnerOptions {
  readonly theme: Theme;
  readonly label: string;
  readonly write: (chunk: string) => void;
  readonly animate: boolean;
}

export function startSpinner({ theme, label, write, animate }: SpinnerOptions): Spinner {
  if (!animate) {
    write(`  ${label}\n`);
    return { stop: (finalLine?: string) => (finalLine ? write(`  ${finalLine}\n`) : undefined) };
  }

  let frame = 0;
  const render = (): void => {
    write(`\r  ${theme.accent(FRAMES[frame] ?? "")} ${theme.dim(label)}`);
    frame = (frame + 1) % FRAMES.length;
  };
  render();
  const timer = setInterval(render, 90);
  timer.unref?.();

  return {
    stop(finalLine?: string) {
      clearInterval(timer);
      write(`\r${" ".repeat(label.length + 8)}\r`);
      if (finalLine) write(`  ${finalLine}\n`);
    },
  };
}
