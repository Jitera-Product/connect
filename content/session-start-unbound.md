An API key is configured for {{BRAND}}, but this repository is not bound to a project.
No project context is loaded and the MCP tools have nothing to read.
Do not call them in this session.

If the user asks about project context, documentation, or shared memory, or
wants this repository bound to one, tell them to run this at the repository root:

    npx @jitera/connect init

That writes a .jitera.json recording which deployment and project this
repository belongs to, alongside AGENTS.md and CLAUDE.md for the rest of the
team. Once it exists, project context loads by itself at the start of a session.
