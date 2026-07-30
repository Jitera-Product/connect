#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { callTool } from "../../src/mcp-client.mjs";
import { claimOnce } from "../../src/session-marker.mjs";

const MAX_CONTEXT_CHARS = 6000;

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function emit(text) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: text,
      },
    })
  );
}

async function main() {
  const input = readInput();

  if (!claimOnce(input.session_id, "recall")) return;

  const url = process.env.CLAUDE_PLUGIN_OPTION_JITERA_MCP_URL;
  const apiKey = process.env.CLAUDE_PLUGIN_OPTION_JITERA_API_KEY;
  if (!url || !apiKey) return;

  let memory;
  try {
    memory = await callTool({
      url,
      apiKey,
      name: "recall_jitera_memory",
      args: {},
      timeoutMs: 8000,
    });
  } catch (error) {
    process.stderr.write(`jitera-connect: could not load project memory: ${error.message}\n`);
    return;
  }

  if (!memory) return;

  const truncated =
    memory.length > MAX_CONTEXT_CHARS
      ? `${memory.slice(0, MAX_CONTEXT_CHARS)}\n\n[truncated, call recall_jitera_memory for the rest]`
      : memory;

  emit(
    `Stored project memory for this workspace, loaded at session start:\n\n${truncated}\n\n` +
      `Treat this as current. Call recall_jitera_memory again if you need a narrower or fuller view, ` +
      `and persist new decisions with remember_jitera_memory.`
  );
}

main();
