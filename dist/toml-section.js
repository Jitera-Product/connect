const SECTION_HEADER = /^\s*\[\[?([^\]]+)\]\]?\s*$/;
const COMMENT_LINE = /^\s*#/;
function peelLeadingRun(lines) {
    let index = lines.length;
    while (index > 0 && COMMENT_LINE.test(lines[index - 1] ?? ""))
        index -= 1;
    return lines.splice(index);
}
export function splitSections(source) {
    const sections = [];
    let header;
    let lines = [];
    for (const line of source.split("\n")) {
        const match = SECTION_HEADER.exec(line);
        if (match) {
            const carried = peelLeadingRun(lines);
            sections.push({ header, lines });
            header = match[1]?.trim();
            lines = [...carried, line];
        }
        else {
            lines.push(line);
        }
    }
    sections.push({ header, lines });
    return sections;
}
export function joinSections(sections) {
    return sections.flatMap((section) => section.lines).join("\n");
}
export function ownsHeader(header, table) {
    return header === table || (header?.startsWith(`${table}.`) ?? false);
}
export function removeTable(source, table) {
    const kept = splitSections(source).filter((section) => !ownsHeader(section.header, table));
    return joinSections(kept);
}
export function upsertTable(source, table, body) {
    const withoutTable = removeTable(source, table).replace(/\s+$/, "");
    const block = `[${table}]\n${body.trim()}`;
    return withoutTable === "" ? `${block}\n` : `${withoutTable}\n\n${block}\n`;
}
export function hasRootKey(source, key) {
    const preamble = splitSections(source)[0];
    if (!preamble)
        return false;
    const pattern = new RegExp(`^\\s*${key}\\s*=`);
    return preamble.lines.some((line) => pattern.test(line));
}
export function ensureRootKey(source, key, value) {
    if (hasRootKey(source, key))
        return source;
    const sections = splitSections(source);
    const preamble = sections[0];
    if (!preamble)
        return `${key} = ${value}\n`;
    const assignment = `${key} = ${value}`;
    const body = preamble.lines.join("\n").replace(/^\n+/, "");
    const rest = sections.slice(1);
    const merged = {
        header: undefined,
        lines: body.trim() === "" ? [assignment, ""] : [assignment, "", ...body.split("\n")],
    };
    return joinSections([merged, ...rest]);
}
//# sourceMappingURL=toml-section.js.map