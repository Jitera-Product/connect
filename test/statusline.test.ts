import test from "node:test";
import assert from "node:assert/strict";

import { renderStatusLine } from "../src/statusline.ts";

function plain(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\[[0-9;]*m/g, "");
}

test("an unconfigured session shows a hollow dot and says so", () => {
  const line = renderStatusLine({ status: { configured: false } });
  assert.match(plain(line), /^○ jitera · not connected$/);
});

test("no recorded status at all renders quietly", () => {
  const line = renderStatusLine({});
  assert.equal(plain(line), "○ jitera");
});

test("a configured session shows a filled dot and its environment", () => {
  const line = renderStatusLine({ status: { configured: true, environment: "studio-05" } });
  assert.equal(plain(line), "● jitera · studio-05");
  assert.match(line, /\[32m/, "the dot must be green");
});

test("recall stats are appended compactly", () => {
  const line = renderStatusLine({
    status: { configured: true, environment: "studio", recallMs: 412, recallChars: 812 },
  });
  assert.match(plain(line), /· recall 812ch\/412ms$/);
});

test("large recalls use rounded units", () => {
  const line = renderStatusLine({
    status: { configured: true, environment: "studio", recallMs: 1400, recallChars: 5200 },
  });
  assert.match(plain(line), /· recall 5\.2k\/1\.4s$/);
});

test("a recall failure is shown instead of stats", () => {
  const line = renderStatusLine({
    status: { configured: true, environment: "studio", recallError: "timeout" },
  });
  assert.match(plain(line), /· recall failed$/);
  assert.match(line, /\[33m/, "the dot turns yellow on failure");
});

test("a repo declaring a different environment is called out", () => {
  const line = renderStatusLine({
    status: { configured: true, environment: "studio" },
    markerEnvironment: "studio-05",
  });
  assert.match(plain(line), /· repo wants studio-05$/);
});

test("a matching repo declaration adds nothing", () => {
  const line = renderStatusLine({
    status: { configured: true, environment: "studio-05" },
    markerEnvironment: "studio-05",
  });
  assert.equal(plain(line), "● jitera · studio-05");
});

test("the line never contains a newline", () => {
  const line = renderStatusLine({
    status: { configured: true, environment: "studio", recallMs: 5, recallChars: 10 },
    markerEnvironment: "studio-04",
  });
  assert.ok(!line.includes("\n"));
});

test("the statusline bin renders state the session-start hook wrote", async () => {
  const { runNode, isolatedTmpdir } = await import("./helpers.ts");
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const shared = isolatedTmpdir();
  writeFileSync(join(shared, ".jitera.json"), JSON.stringify({ environment: "studio-04" }), "utf8");

  await runNode("dist/hooks/session-start.js", {
    input: { hook_event_name: "SessionStart", source: "startup", session_id: "s-1", cwd: shared },
    env: {
      TMPDIR: shared,
      CLAUDE_PLUGIN_OPTION_JITERA_API_KEY: "sk-test",
      CLAUDE_PLUGIN_OPTION_ENVIRONMENT: "studio-05",
    },
  });

  const { stdout } = await runNode("dist/bin/connect.js", {
    args: ["statusline"],
    input: { session_id: "s-1", cwd: shared, workspace: { current_dir: shared } },
    env: { TMPDIR: shared },
  });

  const line = stdout
    .replace(//g, "")
    .replace(/\[[0-9;]*m/g, "")
    .trim();
  assert.equal(line, "● jitera · studio-05 · repo wants studio-04");
});

test("the statusline bin survives an empty stdin", async () => {
  const { runNode } = await import("./helpers.ts");
  const { stdout, code } = await runNode("dist/bin/connect.js", { args: ["statusline"] });
  assert.equal(code, 0);
  assert.match(stdout, /jitera/);
});
