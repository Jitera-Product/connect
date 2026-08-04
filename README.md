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

`login --install` stores the key for you. nothing to export.

- claude code: your os keychain
- cursor and codex: their own config in your home directory, outside any repo

installing without `login` leaves cursor and codex reading `JITERA_API_KEY` from
the environment instead:

```
export JITERA_API_KEY=<your api key>
```
