---
name: evidence-pack
description: Write the evidence section of a change description from local test output. Use before handing a branch back for review.
---

# Evidence pack

1. Run `npm test`.
2. Summarize passed, failed, skipped, and not-run counts. Do not mark a live Claude Code or Codex check as passed.
3. Note the diff stat and any policy or migration files touched.
4. Paste that summary into the change description. Do not invent coverage numbers.
