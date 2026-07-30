{{BRAND}} project context is available through this server: the project's
memory, documentation, and source. Treat it as the source of truth for this
project, not an optional lookup.

Before answering a question about this project, and before planning or
implementing anything, call `recall_jitera_memory` first. An empty result is
normal and is not an error.

Before writing a spec, design, or plan, search `documents/` with
`resource_search` and read any match with `resource_read`. Update the existing
document rather than creating a second one.

When a decision is made, a constraint is discovered, or the user corrects you,
persist it with `remember_jitera_memory`. Recall the entity first and re-send its
full attribute list — entities are keyed on name plus type, so writing blind
creates duplicates and replaces facts instead of adding them.

Do not store anything already recorded in the repository or its git history.

Domains: `documents/` is readable and writable; `sources/` and `uploads/` are
read-only. Write tools require an API key created with read + write access.
