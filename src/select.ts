import type { Theme } from "./theme.ts";

export class SelectCancelledError extends Error {
  override readonly name = "SelectCancelledError";

  constructor() {
    super("selection cancelled");
  }
}

export interface SelectInput {
  setRawMode?(mode: boolean): unknown;
  resume?(): unknown;
  pause?(): unknown;
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
}

export interface SelectOutput {
  write(chunk: string): unknown;
}

export interface SelectOptions<T> {
  readonly items: readonly T[];
  readonly prompt: string;
  readonly label: (item: T) => string;
  readonly theme: Theme;
  readonly input: SelectInput;
  readonly output: SelectOutput;
}

type Action =
  | { readonly kind: "move"; readonly delta: 1 | -1 }
  | { readonly kind: "jump"; readonly index: number }
  | { readonly kind: "confirm" }
  | { readonly kind: "cancel" }
  | { readonly kind: "none" };

function parseKey(sequence: string, count: number): Action {
  if (sequence === "" || sequence === "") return { kind: "cancel" };
  if (sequence === "\r" || sequence === "\n" || sequence === "\r\n") return { kind: "confirm" };
  if (sequence === "[A" || sequence === "OA" || sequence === "k") return { kind: "move", delta: -1 };
  if (sequence === "[B" || sequence === "OB" || sequence === "j") return { kind: "move", delta: 1 };
  if (/^[1-9]$/.test(sequence)) {
    const index = Number(sequence) - 1;
    if (index < count) return { kind: "jump", index };
  }
  return { kind: "none" };
}

export function interactiveSelect<T>({ items, prompt, label, theme, input, output }: SelectOptions<T>): Promise<T> {
  if (items.length === 0) {
    return Promise.reject(new Error("there is nothing to select from"));
  }

  return new Promise<T>((resolve, reject) => {
    let highlighted = 0;

    const row = (index: number): string => {
      const text = label(items[index] as T);
      return index === highlighted ? `  ${theme.accent("❯")} ${theme.bold(text)}` : `    ${text}`;
    };

    const paintItems = (): void => {
      for (let index = 0; index < items.length; index += 1) {
        output.write(`\r[2K${row(index)}\n`);
      }
    };

    const repaint = (): void => {
      output.write(`[${items.length}A`);
      paintItems();
    };

    // Everything drawn (blank line, prompt, blank line, one line per item) is
    // erased again on the way out, so the caller decides what remains on screen.
    const finish = (): void => {
      input.off("data", onData);
      input.setRawMode?.(false);
      input.pause?.();
      output.write(`[${items.length + 3}A\r[J`);
      output.write("[?25h");
    };

    const onData = (chunk: Buffer | string): void => {
      const action = parseKey(chunk.toString(), items.length);
      if (action.kind === "move") {
        highlighted = (highlighted + action.delta + items.length) % items.length;
        repaint();
      } else if (action.kind === "jump") {
        highlighted = action.index;
        repaint();
      } else if (action.kind === "confirm") {
        finish();
        resolve(items[highlighted] as T);
      } else if (action.kind === "cancel") {
        finish();
        reject(new SelectCancelledError());
      }
    };

    output.write("[?25l");
    output.write(`\n  ${theme.bold(prompt)} ${theme.dim("↑/↓ then enter")}\n\n`);
    paintItems();

    input.setRawMode?.(true);
    input.resume?.();
    input.on("data", onData);
  });
}
