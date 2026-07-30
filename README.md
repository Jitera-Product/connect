# Jitera Connect

Agent-facing content for connecting AI coding assistants to Jitera projects.

## Layout

| Path | Purpose |
| --- | --- |
| `content/instructions.md` | Ambient instructions returned by the Jitera MCP server at `initialize`. Budget: 1400 characters. |
| `skills/` | Agent Skills, in the open `SKILL.md` format. |

## Template tokens

Content is templated on `{{BRAND}}`, `{{MCP_URL}}`, and `{{DOCS_URL}}`, resolved
at render time so that self-hosted and white-labelled deployments render their own
branding. Any other `{{...}}` fails validation.

MCP **tool names** (`recall_jitera_memory`, `remember_jitera_memory`) are not
tokenised. They are service identifiers, fixed by the server's tool registry, and
skills must refer to them by their literal names.

## Checks

```bash
npm test            # unit tests and content assertions
npm run validate    # budget and template-token lint
uvx --from skills-ref agentskills validate ./skills/<name>
```

The validator executable is `agentskills`, provided by the `skills-ref` package.
`uvx skills-ref validate` does not exist.

## Consumers

`jitera-boost` vendors `content/instructions.md` under `boost/agent_content/`,
pinned by hash in `boost/agent_content/MANIFEST`. Change content here, then run
`.scripts/sync-agent-content.sh` in that repository.
