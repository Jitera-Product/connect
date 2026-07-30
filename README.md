# Jitera Connect

Connect AI coding assistants to Jitera projects: project documentation, source,
and a shared project memory.

## Install

Claude Code:

```
/plugin marketplace add jitera/jitera-connect
/plugin install jitera-connect
```

You are prompted for an API key, stored in the OS keychain, and an MCP endpoint.
Only self-hosted and non-production deployments need to change the endpoint.

Codex:

```
codex plugin marketplace add jitera/jitera-connect
```

Codex reads the bundled skills. Its MCP server entry goes in `~/.codex/config.toml`
and is written by the installer in a later phase, along with support for Cursor
and other assistants.

## Layout

| Path | Purpose |
| --- | --- |
| `content/instructions.md` | Ambient instructions returned by the Jitera MCP server at `initialize`. Budget: 1400 characters. |
| `content/session-start.md` | Directive injected by the SessionStart hook. |
| `content/checkpoint.md` | Directive injected by the Stop hook every fifth turn. |
| `skills/` | Agent Skills, in the open `SKILL.md` format. |
| `hooks/` | Hook wiring and dependency-free Node hook scripts. |
| `templates/AGENTS.md.tmpl` | Delimited block the installer writes into a project. |
| `.claude-plugin/` | Claude Code plugin and marketplace manifests. |
| `.codex-plugin/`, `.agents/plugins/` | Codex plugin and marketplace manifests. |

## Hooks

| Event | Behaviour |
| --- | --- |
| `SessionStart` | Injects the recall directive. No network, no credentials, so it cannot fail from a disconnected server. |
| `Stop` | Every fifth turn, injects a memory-checkpoint directive. Never blocks, so it cannot trap a session in a continuation loop. |

`SessionStart` fires before MCP servers connect, so it cannot call an MCP tool.
`PreCompact` has no `additionalContext` field and so cannot instruct the model;
it is deliberately unused.

## Template tokens

Content is templated on `{{BRAND}}`, `{{MCP_URL}}`, and `{{DOCS_URL}}`, resolved
at render time so that self-hosted and white-labelled deployments render their own
branding. Any other `{{...}}` fails validation.

MCP **tool names** (`recall_jitera_memory`, `remember_jitera_memory`) are not
tokenised. They are service identifiers, fixed by the server's tool registry, and
skills must refer to them by their literal names.

Hook directives are deliberately brand-free, so hook scripts need no templating.

## Checks

```bash
npm test
npm run validate
claude plugin validate . --strict
uvx --from skills-ref agentskills validate ./skills/<name>
```

The skills validator executable is `agentskills`, provided by the `skills-ref`
package. `uvx skills-ref validate` does not exist.

## Consumers

`jitera-boost` vendors `content/instructions.md` under `boost/agent_content/`,
pinned by hash in `boost/agent_content/MANIFEST`. Change content here, then run
`.scripts/sync-agent-content.sh` in that repository.
