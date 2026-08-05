import { createInterface } from "node:readline/promises";
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
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`\n  ${theme.dim(`Number [1-${items.length}]`)} `)).trim();
    rl.close();
    const picked = items[Number(answer) - 1];
    if (!picked)
        throw new InvalidChoiceError(answer);
    return picked;
}
function parseKey(sequence, count) {
    if (sequence === "" || sequence === "")
        return { kind: "cancel" };
    if (sequence === "\r" || sequence === "\n" || sequence === "\r\n")
        return { kind: "confirm" };
    if (sequence === "[A" || sequence === "OA" || sequence === "k")
        return { kind: "move", delta: -1 };
    if (sequence === "[B" || sequence === "OB" || sequence === "j")
        return { kind: "move", delta: 1 };
    if (/^[1-9]$/.test(sequence)) {
        const index = Number(sequence) - 1;
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
            input.off("data", onData);
            input.setRawMode?.(false);
            input.pause?.();
            output.write(`[${items.length + 3}A\r[J`);
            output.write("[?25h");
        };
        const onData = (chunk) => {
            const action = parseKey(chunk.toString(), items.length);
            if (action.kind === "move") {
                highlighted = (highlighted + action.delta + items.length) % items.length;
                repaint();
            }
            else if (action.kind === "jump") {
                highlighted = action.index;
                repaint();
            }
            else if (action.kind === "confirm") {
                finish();
                resolve(items[highlighted]);
            }
            else if (action.kind === "cancel") {
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
//# sourceMappingURL=select.js.map