#!/usr/bin/env node
const [subcommand] = process.argv.slice(2);
if (subcommand === "login") {
    await import("./login.js");
}
else if (subcommand === "init") {
    await import("./init.js");
}
else if (subcommand === "set-agent") {
    await import("./set-agent.js");
}
else if (subcommand === "statusline") {
    await import("./statusline.js");
}
else {
    await import("./cli.js");
}
export {};
//# sourceMappingURL=connect.js.map