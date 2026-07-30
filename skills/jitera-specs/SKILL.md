---
name: jitera-specs
description: Write, find, and maintain specifications and design documents in {{BRAND}} project documentation. Use before implementing a feature, to find the spec that already describes it; when asked to write a spec, design, plan, or decision record; and when an implementation has diverged from the document describing it.
license: Apache-2.0
metadata:
  author: jitera
  version: "1.0"
---

# Specs in {{BRAND}} documentation

Specs live in the `documents/` domain and are shared with the whole project. They
are living documents — written once, then read and revised as the work proceeds.

`documents/` is the only writable domain. `sources/` and `uploads/` are read-only.

## Before implementing anything

1. `resource_search(pattern="documents/**/*.md", content="<feature terms>")`
2. `resource_read(path="documents/<match>")` on anything plausible
3. Write a new spec only when nothing covers it

Writing a second spec for something already specified is the most common failure
here. Two documents describing the same feature diverge immediately, and
afterwards neither can be trusted.

## Writing a spec

```
resource_write(
  path="documents/specs/checkout-refunds.md",
  operation="create",
  content="<full markdown>"
)
```

Path conventions:

- `documents/specs/<feature>.md` — specifications and designs
- `documents/decisions/<topic>.md` — decision records

Follow whatever convention the project already uses. Check with
`resource_search(pattern="documents/**")` before inventing one.

## Updating a spec

```
resource_write(
  path="documents/specs/checkout-refunds.md",
  operation="update",
  content="<full markdown>"
)
```

- `update` resolves the document by `path`, or by `uuid` when you pass one
- Updates apply as a diff by default. Pass `force_replace=true` only when you
  intend to replace the whole document
- Prefer updating over creating a second document, even for large changes

Update the spec when the implementation diverges from it, when a decision it
records is reversed, or when you find it was wrong. A spec that no longer matches
the code is worse than no spec, because it is trusted and wrong.

## Moving and deleting

```
resource_write(path="documents/old.md", operation="move",
               new_path="documents/specs/new.md")
resource_write(path="documents/obsolete.md", operation="delete")
```

## Generated drafts

Passing `requirements` instead of `content` has the document generated from a
description rather than written by you:

```
resource_write(
  path="documents/specs/checkout-refunds.md",
  requirements="Specification for idempotent refunds, keyed on order id",
  format="md"
)
```

Write `content` yourself by default. Use `requirements` only when the user asks
for a generated draft.

## After writing

Record that the spec exists, so a future session finds it without searching. See
the `jitera-memory` skill for the recall-before-remember rule:

```
remember_jitera_memory(
  name="Refunds specification",
  type="Decision",
  attrs=["Specified in documents/specs/checkout-refunds.md",
         "Refunds are idempotent on order id"]
)
```

## Failures

| Symptom | Cause | What to do |
| --- | --- | --- |
| Write rejected as read-only | The API key has read access only | Tell the user the key needs read + write access, created in project settings. Do not retry. |
| Write to `sources/` or `uploads/` fails | Those domains are read-only by design | Write to `documents/` instead |
| Write to a linked project's path fails | The link to that project does not grant write access | Ask the user to adjust the project link, or write into the current project |
