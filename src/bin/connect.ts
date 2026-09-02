#!/usr/bin/env node
const [subcommand] = process.argv.slice(2);

if (subcommand === "login") {
  await import("./login.ts");
} else if (subcommand === "init") {
  await import("./init.ts");
} else if (subcommand === "set-agent") {
  await import("./set-agent.ts");
} else if (subcommand === "new-key") {
  await import("./new-key.ts");
} else if (subcommand === "statusline") {
  await import("./statusline.ts");
} else {
  await import("./cli.ts");
}
