import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
// How long a lone escape waits to see whether it was the start of a sequence
// rather than the Escape key. Node's own default, and deliberately generous:
// an arrow key that gets split across two reads and is then read as Escape
// abandons the picker and loses the selection, which is far worse than Escape
// taking a moment to register. Ctrl+C cancels instantly either way.
const ESCAPE_TIMEOUT_MS = 500;
export class SelectCancelledError extends Error {
    name = "SelectCancelledError";
    constructor() {
        super("selection cancelled");
    }
}
export class InvalidChoiceError extends Error {
    name = "InvalidChoiceError";
    answer;
    constructor(answer) {
        super(`"${answer}" is not one of the listed options.`);
        this.answer = answer;
    }
}
export class NoInputError extends Error {
    name = "NoInputError";
    constructor() {
        super("no answer was given and there is no terminal to ask on");
    }
}
// `rl.question` never settles when stdin is already at EOF, which left a
// scripted run hanging until the process exited with nothing saved.
async function ask(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await new Promise((resolve, reject) => {
            rl.once("close", () => reject(new NoInputError()));
            void rl.question(prompt).then(resolve, reject);
        }).then((answer) => answer.trim());
    }
    finally {
        rl.close();
    }
}
// Arrow-key selection on a terminal, a numbered prompt everywhere else.
export async function chooseFrom({ items, prompt, label, theme, }) {
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
    const answer = await ask(`\n  ${theme.dim(`Number [1-${items.length}]`)} `);
    const picked = items[Number(answer) - 1];
    if (!picked)
        throw new InvalidChoiceError(answer);
    return picked;
}
export function parseKey(str, key, count) {
    if (key.ctrl && key.name === "c")
        return { kind: "cancel" };
    if (key.name === "escape")
        return { kind: "cancel" };
    if (key.name === "return" || key.name === "enter")
        return { kind: "confirm" };
    if (key.name === "up" || key.name === "k")
        return { kind: "move", delta: -1 };
    if (key.name === "down" || key.name === "j")
        return { kind: "move", delta: 1 };
    if (str && /^[1-9]$/.test(str)) {
        const index = Number(str) - 1;
        if (index < count)
            return { kind: "jump", index };
    }
    return { kind: "none" };
}
export function interactiveSelect({ items, prompt, label, theme, input, output }) {
    if (items.length === 0) {
        return Promise.reject(new Error("there is nothing to select from"));
    }
    return new Promise((resolve, reject) => {
        let highlighted = 0;
        const row = (index) => {
            const text = label(items[index]);
            return index === highlighted ? `  ${theme.accent("❯")} ${theme.bold(text)}` : `    ${text}`;
        };
        const paintItems = () => {
            for (let index = 0; index < items.length; index += 1) {
                output.write(`\r[2K${row(index)}\n`);
            }
        };
        const repaint = () => {
            output.write(`[${items.length}A`);
            paintItems();
        };
        // Everything drawn (blank line, prompt, blank line, one line per item) is
        // erased again on the way out, so the caller decides what remains on screen.
        const finish = () => {
            input.off("keypress", onKey);
            input.setRawMode?.(false);
            input.pause?.();
            output.write(`[${items.length + 3}A\r[J`);
            output.write("[?25h");
        };
        let settled = false;
        const onKey = (str, key) => {
            if (settled)
                return;
            const action = parseKey(str, key ?? {}, items.length);
            if (action.kind === "move") {
                highlighted = (highlighted + action.delta + items.length) % items.length;
                repaint();
            }
            else if (action.kind === "jump") {
                highlighted = action.index;
                repaint();
            }
            else if (action.kind === "confirm") {
                settled = true;
                finish();
                resolve(items[highlighted]);
            }
            else if (action.kind === "cancel") {
                settled = true;
                finish();
                reject(new SelectCancelledError());
            }
        };
        output.write("[?25l");
        output.write(`\n  ${theme.bold(prompt)} ${theme.dim("↑/↓ then enter")}\n\n`);
        paintItems();
        // Node reassembles split escape sequences and names each key, so the same
        // arrow works whatever the terminal sends. The timeout is how long a lone
        // escape waits to see whether it was the start of a sequence.
        emitKeypressEvents(input, { escapeCodeTimeout: ESCAPE_TIMEOUT_MS });
        input.setRawMode?.(true);
        input.resume?.();
        input.on("keypress", onKey);
    });
}
export function parseMultiKey(str, key) {
    if (key.ctrl && key.name === "c")
        return { kind: "cancel" };
    if (key.name === "escape")
        return { kind: "cancel" };
    if (key.name === "return" || key.name === "enter")
        return { kind: "confirm" };
    // Some terminals report the space bar only as its character.
    if (key.name === "space" || str === " ")
        return { kind: "toggle" };
    if (key.name === "a")
        return { kind: "all" };
    if (key.name === "n")
        return { kind: "none_of_them" };
    if (key.name === "up" || key.name === "k")
        return { kind: "move", delta: -1 };
    if (key.name === "down" || key.name === "j")
        return { kind: "move", delta: 1 };
    return { kind: "none" };
}
// Rows are redrawn by moving the cursor up a fixed number of lines, so every
// row has to occupy exactly one line. Agent descriptions are free text from the
// studio, so they are flattened and cut to the terminal width.
function oneLine(text, width) {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length <= width ? flat : `${flat.slice(0, Math.max(1, width - 1))}…`;
}
// Checkbox selection: space toggles, enter confirms. Returns the ticked items,
// which may legitimately be none — "none" means "do not narrow", and the
// caller decides what that implies.
export function multiSelect({ items, prompt, label, theme, input, output, selected, viewport, columns, }) {
    if (items.length === 0) {
        return Promise.reject(new Error("there is nothing to select from"));
    }
    const width = Math.max(20, (columns ?? process.stdout.columns ?? 80) - 8);
    // Leave room for the blank line, the prompt, the blank line and the footer.
    const rows = Math.max(1, Math.min(items.length, viewport ?? Math.max(1, (process.stdout.rows ?? 24) - 5)));
    const windowed = rows < items.length;
    const painted = windowed ? rows + 1 : rows;
    return new Promise((resolve, reject) => {
        let highlighted = 0;
        let top = 0;
        const ticked = items.map((item) => (selected ? selected(item) : false));
        const row = (index) => {
            const box = ticked[index] ? theme.ok("[x]") : theme.dim("[ ]");
            const text = oneLine(label(items[index]), width);
            return index === highlighted
                ? `  ${theme.accent("❯")} ${box} ${theme.bold(text)}`
                : `    ${box} ${text}`;
        };
        const scroll = () => {
            if (highlighted < top)
                top = highlighted;
            else if (highlighted >= top + rows)
                top = highlighted - rows + 1;
            top = Math.max(0, Math.min(top, items.length - rows));
        };
        const paintItems = () => {
            scroll();
            for (let offset = 0; offset < rows; offset += 1) {
                output.write(`\r\u001b[2K${row(top + offset)}\n`);
            }
            if (windowed) {
                output.write(`\r\u001b[2K    ${theme.dim(`${highlighted + 1}/${items.length}`)}\n`);
            }
        };
        const repaint = () => {
            output.write(`\u001b[${painted}A`);
            paintItems();
        };
        const finish = () => {
            input.off("keypress", onKey);
            input.setRawMode?.(false);
            input.pause?.();
            output.write(`\u001b[${painted + 3}A\r\u001b[J`);
            output.write("\u001b[?25h");
        };
        let settled = false;
        const onKey = (str, key) => {
            if (settled)
                return;
            const action = parseMultiKey(str, key ?? {});
            if (action.kind === "move") {
                highlighted = (highlighted + action.delta + items.length) % items.length;
                repaint();
            }
            else if (action.kind === "toggle") {
                ticked[highlighted] = !ticked[highlighted];
                repaint();
            }
            else if (action.kind === "all") {
                ticked.fill(true);
                repaint();
            }
            else if (action.kind === "none_of_them") {
                ticked.fill(false);
                repaint();
            }
            else if (action.kind === "confirm") {
                settled = true;
                finish();
                resolve(items.filter((_item, index) => ticked[index]));
            }
            else if (action.kind === "cancel") {
                settled = true;
                finish();
                reject(new SelectCancelledError());
            }
        };
        output.write("\u001b[?25l");
        output.write(`\n  ${theme.bold(prompt)} ${theme.dim("↑/↓ move · space select · a all · n none · enter save")}\n\n`);
        paintItems();
        // Node reassembles split escape sequences and names each key, so the same
        // arrow works whatever the terminal sends. The timeout is how long a lone
        // escape waits to see whether it was the start of a sequence.
        emitKeypressEvents(input, { escapeCodeTimeout: ESCAPE_TIMEOUT_MS });
        input.setRawMode?.(true);
        input.resume?.();
        input.on("keypress", onKey);
    });
}
// Terminal picker when there is one, a numbered list everywhere else.
export async function chooseManyFrom({ items, prompt, label, theme, selected, }) {
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
        process.stdout.write(`    ${theme.accent(String(index + 1).padStart(2))} [${mark}] ${label(item)}\n`);
    });
    const answer = await ask(`\n  ${theme.dim(`Numbers, comma separated, or blank for all [1-${items.length}]`)} `);
    if (!answer)
        return [];
    const picked = [];
    for (const part of answer.split(",")) {
        const index = Number(part.trim()) - 1;
        const item = items[index];
        if (!item)
            throw new InvalidChoiceError(part.trim());
        if (!picked.includes(item))
            picked.push(item);
    }
    return picked;
}
//# sourceMappingURL=select.js.map