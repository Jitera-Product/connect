# how to install

## one command

```
npx @jitera/connect login --install
```

Signs you in through your browser, creates an api key, and configures every
assistant it finds. Detected independently: claude code, cursor, codex.

For a pilot or staging environment:

```
npx @jitera/connect login --env=studio-05 --install
```

## choosing what to connect

`login` asks which organisation, then which project. It only offers projects you
can create an api key on. Skip either prompt:

```
npx @jitera/connect login --org=<slug>
npx @jitera/connect login --project=<uuid>
```

## claude code

```
/plugin marketplace add jitera-product/connect
/plugin install jitera-connect
```

## codex

```
codex plugin marketplace add jitera-product/connect
```

## cursor

```
npx @jitera/connect
```

## shared instructions, committed to the repo

```
npx @jitera/connect init
```

Optional. Writes three committable files at the root of the current git
repository: an AGENTS.md block for teammates whose assistants read repository
instructions natively rather than through the plugin, a CLAUDE.md that imports
it, and a .jitera.json recording which deployment this repository belongs to
(`--env=`, and optionally `--project=<uuid>`). Commit all three.

The .jitera.json marker is what teammates' sessions read: a teammate who has
not connected yet is told the exact login command for the right environment,
and a teammate whose plugin points at a different environment gets a mismatch
warning instead of silently reading the wrong project.

Refuses to run outside a git repository, because instructions written above a
repo are invisible to assistants that read AGENTS.md and leak into every
project below them. Connected sessions do not need AGENTS.md: the mcp server
delivers the same guidance itself.

## what applies where

The login configuration is global: one api key and one environment per user,
per machine, stored by `login --install`. Every repo you open uses it — the
plugin, skills, and hooks all work without any per-repo files, so `init` is
optional everywhere.

`.jitera.json` never configures anything. It only declares what the repo
expects, so a session can cross-check the global setting: a teammate who has
not connected yet is told the exact login command for the right environment,
and a mismatched environment gets a warning instead of silently reading the
wrong project.

With a user-level key, `.jitera.json` is also what selects the project: the
proxy and hooks read it from the repository and send it with every request, so
different repos on one machine talk to different projects with a single key.
On older deployments the key itself is bound to one project; there the marker
only makes a mismatch visible.

## status line

`login --install` also puts the connection in Claude Code's status line:

    ● jitera · studio-05 · recall 1.2k/0.4s

A filled green dot means the session is configured; hollow means not connected;
yellow flags a failed recall or a repo whose .jitera.json wants a different
environment. The renderer is pure-local — it reads state the hooks already
wrote, never the network — and it resolves the current plugin version at run
time, so plugin updates never orphan it.

Claude Code has a single status line slot. If you already have one configured,
it is left alone and the install says so; remove yours and rerun login, or wire
it manually in settings.json with `statusLine` pointing at the plugin's
`dist/bin/statusline.js`.

## pilot and staging environments

claude code, at install:

```
/plugin install jitera-connect --config environment=studio-05
```

claude code, after installing:

```
/plugin configure jitera-connect
```

cursor and codex:

```
npx @jitera/connect --env=studio-05
npx @jitera/connect --env=studio-stage
```

## the api key

`login` creates a **user-level** key when the deployment supports it: one key,
valid on every project your account can access. Older deployments issue
project-scoped keys instead, and login falls back to choosing a project — you
will see a notice when that happens.

With a user-level key the project comes from the repository, not the key: `init`
records it in the committed `.jitera.json`, and every request carries it as an
`X-Jitera-Project` header. A teammate with access who clones the repo needs only
their own one-time `login --install` — no per-project setup.

`login --install` stores the key for you. nothing to export.

- claude code: your os keychain
- cursor and codex: their own config in your home directory, outside any repo

login also keeps a private session (`~/.config/jitera-connect/session.json`,
`0600`) so `init` can list your projects later without another browser
round-trip.

installing without `login` leaves cursor and codex reading `JITERA_API_KEY` from
the environment instead:

```
export JITERA_API_KEY=<your api key>
```
