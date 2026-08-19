# jitera connect

connects claude code, cursor, and codex to a jitera project: documentation,
source, and shared project memory over mcp.

## install

```
npx @jitera/connect login --install
```

signs you in through the browser, creates a user-level api key, and configures
every assistant it finds. one key covers every project your account can reach,
so you run this once per machine and never again per project.

for a pilot or staging environment:

```
npx @jitera/connect login --env=studio-05 --install
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

## binding a repo to a project

```
npx @jitera/connect init
```

run this once per repo, from inside the repo, and commit the three files it
writes. `.jitera.json` records the deployment and project the repo belongs to.
AGENTS.md carries the same guidance for assistants that read it natively, and
CLAUDE.md imports it, because claude code reads CLAUDE.md and not AGENTS.md.

init reuses the login you already did to list your projects and asks which one
this repo is. pass `--project=<uuid>` to skip the question, or `--dry-run` to
see what it would write.

it refuses to run outside a git repository. instructions written above a repo
are invisible to anything that reads AGENTS.md from the repo root, and a
CLAUDE.md above a repo leaks into every project underneath it.

## what applies where

the api key is global: one per user, per machine, stored by `login --install`.
it says who you are, not which project you are in.

`.jitera.json` says which project. without it a repo is unbound, and the hooks
do nothing at all there: no context is gathered, no checkpoint is asked for, and
no call reaches the server. a repo you have not run `init` in is left alone,
which is why init is per repo and login is per machine.

an unbound session is not silent about it. session start tells the assistant the
repo is unbound and to suggest `npx @jitera/connect init`, and the status line
shows the same thing.

sessions also check the marker against the plugin. a teammate who has not signed
in yet gets the exact login command for the right environment. a teammate
pointed at a different environment gets a warning instead of quietly reading the
wrong project.

the proxy and the hooks send the project it names as an `X-Jitera-Project`
header, so several repos on one machine can talk to different projects through a
single key. older deployments bind the key itself to one project; there the
marker still decides whether the hooks run, and makes a mismatch visible.

## seeing your keys

in the jitera app your own keys live under your avatar, then account, then api
keys. you can create and revoke them from there. project keys sit in the
project's settings, agent keys under the agent, and organisation keys under
settings, then organisation.

## the api key

login creates a user-level key when the deployment supports it. older
deployments issue project-scoped keys, so login falls back to asking which
project and tells you when that happens.

`login --install` stores the key for you, so there is nothing to export:

- claude code: your os keychain
- cursor and codex: their own config in your home directory, outside any repo

it also keeps a private session at `~/.config/jitera-connect/session.json`,
mode 0600, so init can list your projects without another trip through the
browser.

installing without `login` leaves cursor and codex reading `JITERA_API_KEY`
from the environment:

```
export JITERA_API_KEY=<your api key>
```

## status line

`login --install` also puts the connection in claude code's status line:

```
● jitera · studio-05 · recall 1.2k/0.4s
```

green means the session is configured, hollow means not connected, and yellow
means a failed recall or a repo asking for a different environment. it reads
state the hooks already wrote, so it never touches the network, and it resolves
the installed plugin version when it runs, so an update does not orphan it.

claude code has one status line slot. if something else already owns it, login
leaves it alone and says so. remove yours and run login again, or point
`statusLine` at the plugin's `dist/bin/statusline.js` yourself.

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

## other flags

```
npx @jitera/connect --print         print the resolved endpoints and exit
npx @jitera/connect --dry-run       report what would change, write nothing
npx @jitera/connect --uninstall     remove the jitera server
npx @jitera/connect --skip-skills   write mcp config only
```
