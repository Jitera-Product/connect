---
name: jitera-setup
description: Diagnose a broken {{BRAND}} connection — missing tools, authentication failures, read-only API keys, or the wrong project. Use when {{BRAND}} tools are absent from the tool list, when a call fails with an authentication or authorization error, or when the data returned belongs to a different project than expected.
license: Apache-2.0
metadata:
  author: jitera
  version: "1.0"
---

# Diagnosing a {{BRAND}} connection

Work through these in order. Report the specific cause you find — never tell the
user only that something failed.

## 1. Are the tools present?

If `resource_search`, `resource_read`, and `recall_jitera_memory` are missing from
your tool list, the MCP server is not connected at all. This is not a permissions
problem and no API key will fix it.

Ask the user to confirm the server is configured, then to restart the assistant.
Most clients load MCP servers only at startup.

## 2. Does any call succeed?

Try the cheapest possible read:

```
resource_read(path="/")
```

| Result | Meaning |
| --- | --- |
| A directory listing | Connection and key are fine; the problem is elsewhere |
| Unauthorized or authentication error | The key is missing, wrong, revoked, or expired |
| An empty listing | Connected, but the project has no resources yet |

## 3. Is the key read-only?

A read that works alongside a write that fails with a read-only message means the
key was created with read access only.

Writes need a key created with **read + write** access. The access level is fixed
when the key is created and cannot be changed afterwards, so this needs a new key
from project settings.

## 4. Is it the right project?

An API key is bound to one project. If the resources returned belong to a
different project than the user expects, the key belongs to that other project.

Confirm with `resource_read(path="/")` and describe what you see back to the user
so they can recognise it.

## 5. Is memory scoped more narrowly than expected?

A key bound to a specific agent sees only that agent's memory partition. A
project-level key sees project-wide memory. If recall returns less than the user
expects, the key is probably agent-scoped.

## What not to do

- Do not retry an authentication failure or a read-only rejection — neither is
  transient, and retrying only delays the real fix
- Do not invent a workaround, such as writing a spec into the local repository
  when the intent was to store it in the project. State what is blocked and why
