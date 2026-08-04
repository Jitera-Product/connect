#!/usr/bin/env node
const [subcommand] = process.argv.slice(2);

if (subcommand === "login") {
  await import("./login.ts");
} else if (subcommand === "init") {
  await import("./init.ts");
} else {
  await import("./cli.ts");
}
