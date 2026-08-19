---
name: jitera-context
description: Search and read {{BRAND}} project resources — documentation, source code, and uploaded files. Use when you need project context you do not already have, when the user refers to a file, document, or upload by name, and before answering questions about how this project works.
license: Apache-2.0
metadata:
  author: jitera
  version: "1.0"
---

# Reading {{BRAND}} project resources

Three virtual domains:

| Domain | Contents | Writable |
| --- | --- | --- |
| `documents/` | Project documentation — markdown, HTML, PDFs | yes |
| `sources/` | Project source code | no |
| `uploads/` | Uploaded files | no |

## Start with the whole picture

```
gather_jitera_context(task="how do refunds get issued", budget=6000)
```

Recalls project memory and searches documentation and source in one call,
running the widening fallbacks itself: memory falls back to every stored entity
when keywords match nothing, and search falls back to fuzzy matching when exact
matching is dry. It also lists the project's agents, so a recalled fact can be
attributed. Use it before planning or answering, then narrow with the tools
below.

It is not a once-per-session lookup. Call it again whenever the work reaches
something you have not gathered context for yet: a subsystem you have not
touched, a name you do not recognise, or a decision about how something should
work. Checking costs one call; guessing costs the rest of the session.

## Searching

```
resource_search(pattern="documents/**/*.md", content="refund", limit=30, offset=0)
```

- `pattern` — a glob over virtual paths supporting `*`, `**`, and `?`. Omit the
  domain prefix to search every domain: `resource_search(pattern="**/checkout*.*")`
- `content` — a grep-style match inside files, supporting boolean expressions:
  `content="(api OR rest) AND controller"`
- `mode` — how `content` is matched. `default` is a case-insensitive substring;
  `regex` treats `content` as a case-insensitive regular expression; `full-text`
  matches fuzzily by trigram similarity, for when you are unsure of the exact
  wording. `pattern` is always a glob, whatever the mode
- Results are grouped by domain. Open a match with `resource_read`

Search before reading. Do not guess paths.

## Reading

```
resource_read(path="sources/frontend/src/App.tsx", line_from=1, line_number=300)
```

- A file path returns content with line numbers; a directory path returns a
  listing. `resource_read(path="/")` lists the root
- `line_from` is 1-indexed; `line_number` defaults to 300
- For large PDFs read on the fly, `line_from` selects the starting **page**
  rather than the line. The returned window ends with the `line_from` value to
  pass in order to read further

## Documents that are mostly images

`analyze_document(url, requirements)` extracts information by looking at a
document rather than reading its text. Use it for scanned PDFs, diagrams,
screenshots, and spreadsheets where layout carries meaning.

## Budget

Search narrowly, then read the specific range you need. Reading whole large files
to locate one function spends the context you need for the actual work.

## Failures

| Symptom | Cause | What to do |
| --- | --- | --- |
| A domain reports that it is disabled | That read domain is turned off for this agent or project | Tell the user which domain is disabled. Do not retry. |
| Search returns nothing | Pattern too narrow, or the wrong domain | Drop the domain prefix and widen the glob before concluding the file is absent |
| One path errors while a similar one works | The project has two path conventions and the editor form differs | Re-run `resource_search` and use the exact path it returns |
