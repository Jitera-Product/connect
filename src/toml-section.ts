const SECTION_HEADER = /^\s*\[\[?([^\]]+)\]\]?\s*$/;

export interface TomlSection {
  readonly header: string | undefined;
  readonly lines: readonly string[];
}

const COMMENT_LINE = /^\s*#/;

function peelLeadingRun(lines: string[]): string[] {
  let index = lines.length;
  while (index > 0 && COMMENT_LINE.test(lines[index - 1] ?? "")) index -= 1;
  return lines.splice(index);
}

export function splitSections(source: string): TomlSection[] {
  const sections: TomlSection[] = [];
  let header: string | undefined;
  let lines: string[] = [];

  for (const line of source.split("\n")) {
    const match = SECTION_HEADER.exec(line);
    if (match) {
      const carried = peelLeadingRun(lines);
      sections.push({ header, lines });
      header = match[1]?.trim();
      lines = [...carried, line];
    } else {
      lines.push(line);
    }
  }
  sections.push({ header, lines });
  return sections;
}

export function joinSections(sections: readonly TomlSection[]): string {
  return sections.flatMap((section) => section.lines).join("\n");
}

export function ownsHeader(header: string | undefined, table: string): boolean {
  return header === table || (header?.startsWith(`${table}.`) ?? false);
}

export function removeTable(source: string, table: string): string {
  const kept = splitSections(source).filter((section) => !ownsHeader(section.header, table));
  return joinSections(kept);
}

export function upsertTable(source: string, table: string, body: string): string {
  const withoutTable = removeTable(source, table).replace(/\s+$/, "");
  const block = `[${table}]\n${body.trim()}`;
  return withoutTable === "" ? `${block}\n` : `${withoutTable}\n\n${block}\n`;
}

export function hasRootKey(source: string, key: string): boolean {
  const preamble = splitSections(source)[0];
  if (!preamble) return false;
  const pattern = new RegExp(`^\\s*${key}\\s*=`);
  return preamble.lines.some((line) => pattern.test(line));
}

export function ensureRootKey(source: string, key: string, value: string): string {
  if (hasRootKey(source, key)) return source;
  const sections = splitSections(source);
  const preamble = sections[0];
  if (!preamble) return `${key} = ${value}\n`;

  const assignment = `${key} = ${value}`;
  const body = preamble.lines.join("\n").replace(/^\n+/, "");
  const rest = sections.slice(1);
  const merged: TomlSection = {
    header: undefined,
    lines: body.trim() === "" ? [assignment, ""] : [assignment, "", ...body.split("\n")],
  };
  return joinSections([merged, ...rest]);
}
