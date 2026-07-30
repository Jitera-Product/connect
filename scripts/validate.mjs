#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const KNOWN_TOKENS = new Set(["BRAND", "MCP_URL", "DOCS_URL"]);
export const INSTRUCTIONS_BUDGET_CHARS = 1400;

const TOKEN_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function findUnknownTokens(text) {
  const unknown = new Set();
  for (const match of text.matchAll(TOKEN_RE)) {
    if (!KNOWN_TOKENS.has(match[1])) unknown.add(match[1]);
  }
  return [...unknown];
}

export function checkBudget(text, budget) {
  return { ok: text.length <= budget, length: text.length };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  const errors = [];

  const instructionsPath = join(ROOT, "content", "instructions.md");
  if (!existsSync(instructionsPath)) {
    errors.push(`missing required file: content/instructions.md`);
  } else {
    const text = readFileSync(instructionsPath, "utf8");
    const budget = checkBudget(text, INSTRUCTIONS_BUDGET_CHARS);
    if (!budget.ok) {
      errors.push(
        `content/instructions.md is ${budget.length} characters, over the ` +
          `${INSTRUCTIONS_BUDGET_CHARS} character budget. This text is loaded into ` +
          `every session of every connected client — shorten it or move detail into a skill.`
      );
    }
  }

  const files = [];

  const contentDir = join(ROOT, "content");
  if (existsSync(contentDir)) {
    for (const name of readdirSync(contentDir)) {
      if (name.endsWith(".md")) files.push(join(contentDir, name));
    }
  }

  const skillsDir = join(ROOT, "skills");
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      files.push(join(skillsDir, name, "SKILL.md"));
    }
  }

  const templatesDir = join(ROOT, "templates");
  if (existsSync(templatesDir)) {
    for (const name of readdirSync(templatesDir)) {
      files.push(join(templatesDir, name));
    }
  }

  for (const file of files) {
    if (!existsSync(file)) continue;
    const unknown = findUnknownTokens(readFileSync(file, "utf8"));
    if (unknown.length) {
      errors.push(
        `${file.slice(ROOT.length + 1)} uses unknown template tokens: ` +
          `${unknown.join(", ")}. Known tokens are ${[...KNOWN_TOKENS].join(", ")}.`
      );
    }
  }

  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  console.log(`validated ${files.filter(existsSync).length} content file(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
