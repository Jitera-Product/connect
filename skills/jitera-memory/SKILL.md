---
name: jitera-memory
description: Recall and maintain {{BRAND}} project memory — stored decisions, constraints, conventions, and domain knowledge shared across the project. Use before planning or implementing anything, when the user refers to earlier work or past decisions, and after a decision is made, a constraint is discovered, or the user corrects you.
license: Apache-2.0
metadata:
  author: jitera
  version: "1.0"
---

# {{BRAND}} project memory

Project memory is a graph of entities. Each entity has a `name`, a `type`, and a
list of `attrs` — short factual statements. Entities reference each other with
`[[id]]` links.

Memory is shared with everyone working on the project. What you write, your
teammates read.

## Recall before you act

Call `recall_jitera_memory` before:

- starting any task in this project
- planning or proposing an approach
- making an architectural or naming decision
- answering anything that refers to earlier work — "like we did before", "the
  usual pattern", "what did we decide about…"

An empty result is normal. It means nothing is stored yet, not that the call
failed.

### When the first recall comes back thin

`recall_jitera_memory` filters entities by keywords extracted from `query`. Work
down this ladder, stopping as soon as you have what you need:

1. `recall_jitera_memory(query="<specific terms from the task>")`
2. `recall_jitera_memory(query="<the subsystem or domain>")`
3. `recall_jitera_memory()` with no query — returns every stored entity

Do not conclude that memory is empty until step 3 returns nothing. Results
containing `[[id]]` references mean related entities exist, and a broader query
will surface them.

## Remember when knowledge is created

Persist with `remember_jitera_memory(name, type, attrs)` when:

- a decision is made — including why it was chosen over the alternative
- the user corrects you, or rejects an approach
- you discover a constraint that is not obvious from the code: a rate limit, an
  ordering requirement, a service that must be restarted, a deploy gotcha
- you establish a convention future work should follow
- a session ends with something worth carrying forward

### Recall before you remember

`remember_jitera_memory` upserts on `name` + `type`, and `attrs` **replaces** the
existing list rather than appending to it. Writing without recalling first either
fragments the graph into near-duplicates or silently drops facts:

```
Checkout Service (Service)  — attrs: [...]
Checkout service (Service)  — attrs: [...]
CheckoutService (Service)   — attrs: [...]
```

Procedure:

1. `recall_jitera_memory(query="<entity name>")`
2. If it exists, re-send it with the **full** attribute list — every existing
   fact plus the new one
3. If it does not exist, create it using the name form already used elsewhere in
   the project

### Shape of a good entity

| Field | Guidance |
| --- | --- |
| `name` | The display name people actually use. Match existing casing. |
| `type` | A stable category — `Service`, `Decision`, `Constraint`, `Convention`, `Person`, `System`. Reuse types already in the graph. |
| `attrs` | Short, self-contained statements. One fact per entry. |

Good:

```
name:  "Checkout Service"
type:  "Service"
attrs: ["Owns payment capture and refunds",
        "Reaches Stripe through the billing gateway, never directly",
        "Refunds are idempotent on order id, not payment id"]
```

Poor — vague, and re-derivable from the code:

```
name:  "checkout"
type:  "thing"
attrs: ["handles checkout stuff", "has files in src/checkout"]
```

## What not to store

- Anything derivable from the repository or its git history — file layout,
  function signatures, what a past commit changed
- Transient state — what you are doing right now, a branch name, a test you are
  part-way through fixing
- Secrets, credentials, tokens, or customer personal data
- Long prose. If it needs paragraphs, write a document (see the `jitera-specs`
  skill) and store a one-line pointer to it in memory

## Failures

| Symptom | Cause | What to do |
| --- | --- | --- |
| `remember_jitera_memory` rejected as read-only | The API key was created with read access only | Tell the user the key needs read + write access, created in project settings. Do not retry. |
| Recall returns unrelated entities | Keyword extraction matched loosely | Narrow the query, or recall with no query and filter the results yourself |
| Recall is still empty at step 3 | Memory genuinely is empty | Proceed, and record what you learn as you go |
