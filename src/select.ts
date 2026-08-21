import { createInterface } from "node:readline/promises";

import type { Theme } from "./theme.ts";

export class SelectCancelledError extends Error {
  override readonly name = "SelectCancelledError";

  constructor() {
    super("selection cancelled");
  }
}

export class InvalidChoiceError extends Error {
  override readonly name = "InvalidChoiceError";
  readonly answer: string;

  constructor(answer: string) {
    super(`"${answer}" is not one of the listed options.`);
    this.answer = answer;
  }
}

// Arrow-key selection on a terminal, a numbered prompt everywhere else.
export async function chooseFrom<T>({
  items,
  prompt,
  label,
  theme,
}: {
  readonly items: readonly T[];
  readonly prompt: string;
  readonly label: (item: T) => string;
  readonly theme: Theme;
}): Promise<T> {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return interactiveSelect({
      items,
      prompt,
      label,
      theme,
      input: process.stdin,
      output: process.stdout,
    });
  }

  process.stdout.write(`\n  ${theme.bold(prompt)}\n\n`);
  items.forEach((item, index) => {
    process.stdout.write(`    ${theme.accent(String(index + 1).padStart(2))}  ${label(item)}\n`);
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\n  ${theme.dim(`Number [1-${items.length}]`)} `)).trim();
  rl.close();
  const picked = items[Number(answer) - 1];
  if (!picked) throw new InvalidChoiceError(answer);
  return picked;
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

type MultiAction =
  | { readonly kind: "move"; readonly delta: 1 | -1 }
  | { readonly kind: "toggle" }
  | { readonly kind: "all" }
  | { readonly kind: "none_of_them" }
  | { readonly kind: "confirm" }
  | { readonly kind: "cancel" }
  | { readonly kind: "none" };

function parseMultiKey(sequence: string): MultiAction {
  if (sequence === "\u0003" || sequence === "\u001b") return { kind: "cancel" };
  if (sequence === "\r" || sequence === "\n" || sequence === "\r\n") return { kind: "confirm" };
  if (sequence === " ") return { kind: "toggle" };
  if (sequence === "a" || sequence === "A") return { kind: "all" };
  if (sequence === "n" || sequence === "N") return { kind: "none_of_them" };
  if (sequence === "\u001b[A" || sequence === "\u001bOA" || sequence === "k") {
    return { kind: "move", delta: -1 };
  }
  if (sequence === "\u001b[B" || sequence === "\u001bOB" || sequence === "j") {
    return { kind: "move", delta: 1 };
  }
  return { kind: "none" };
}

export interface MultiSelectOptions<T> extends SelectOptions<T> {
  // Items to start ticked, so re-running the command shows the current state
  // rather than a blank slate.
  readonly selected?: (item: T) => boolean;
}

// Checkbox selection: space toggles, enter confirms. Returns the ticked items,
// which may legitimately be none — "none" means "do not narrow", and the
// caller decides what that implies.
export function multiSelect<T>({
  items,
  prompt,
  label,
  theme,
  input,
  output,
  selected,
}: MultiSelectOptions<T>): Promise<T[]> {
  if (items.length === 0) {
    return Promise.reject(new Error("there is nothing to select from"));
  }

  return new Promise<T[]>((resolve, reject) => {
    let highlighted = 0;
    const ticked = items.map((item) => (selected ? selected(item) : false));

    const row = (index: number): string => {
      const box = ticked[index] ? theme.ok("[x]") : theme.dim("[ ]");
      const text = label(items[index] as T);
      return index === highlighted
        ? `  ${theme.accent("❯")} ${box} ${theme.bold(text)}`
        : `    ${box} ${text}`;
    };

    const paintItems = (): void => {
      for (let index = 0; index < items.length; index += 1) {
        output.write(`\r\u001b[2K${row(index)}\n`);
      }
    };

    const repaint = (): void => {
      output.write(`\u001b[${items.length}A`);
      paintItems();
    };

    const finish = (): void => {
      input.off("data", onData);
      input.setRawMode?.(false);
      input.pause?.();
      output.write(`\u001b[${items.length + 3}A\r\u001b[J`);
      output.write("\u001b[?25h");
    };

    const onData = (chunk: Buffer | string): void => {
      const action = parseMultiKey(chunk.toString());
      if (action.kind === "move") {
        highlighted = (highlighted + action.delta + items.length) % items.length;
        repaint();
      } else if (action.kind === "toggle") {
        ticked[highlighted] = !ticked[highlighted];
        repaint();
      } else if (action.kind === "all") {
        ticked.fill(true);
        repaint();
      } else if (action.kind === "none_of_them") {
        ticked.fill(false);
        repaint();
      } else if (action.kind === "confirm") {
        finish();
        resolve(items.filter((_item, index) => ticked[index]));
      } else if (action.kind === "cancel") {
        finish();
        reject(new SelectCancelledError());
      }
    };

    output.write("\u001b[?25l");
    output.write(
      `\n  ${theme.bold(prompt)} ${theme.dim("↑/↓ move · space select · a all · n none · enter save")}\n\n`
    );
    paintItems();

    input.setRawMode?.(true);
    input.resume?.();
    input.on("data", onData);
  });
}

// Terminal picker when there is one, a numbered list everywhere else.
export async function chooseManyFrom<T>({
  items,
  prompt,
  label,
  theme,
  selected,
}: {
  readonly items: readonly T[];
  readonly prompt: string;
  readonly label: (item: T) => string;
  readonly theme: Theme;
  readonly selected?: (item: T) => boolean;
}): Promise<T[]> {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    return multiSelect({
      items,
      prompt,
      label,
      theme,
      input: process.stdin,
      output: process.stdout,
      ...(selected ? { selected } : {}),
    });
  }

  process.stdout.write(`\n  ${theme.bold(prompt)}\n\n`);
  items.forEach((item, index) => {
    const mark = selected?.(item) ? theme.ok("x") : " ";
    process.stdout.write(
      `    ${theme.accent(String(index + 1).padStart(2))} [${mark}] ${label(item)}\n`
    );
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await rl.question(`\n  ${theme.dim(`Numbers, comma separated, or blank for all [1-${items.length}]`)} `)
  ).trim();
  rl.close();

  if (!answer) return [];

  const picked: T[] = [];
  for (const part of answer.split(",")) {
    const index = Number(part.trim()) - 1;
    const item = items[index];
    if (!item) throw new InvalidChoiceError(part.trim());
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}
