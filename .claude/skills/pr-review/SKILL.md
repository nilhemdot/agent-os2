---
name: pr-review
description: Review an AgentOS change against the five invariants and the spec acceptance tests.
---

# PR review

Reject the change if it:

- adds an agent loop, a tool registry, or model-written plans
- treats a transcript as the source of state
- lets a model decide allow, ask, or deny
- runs an attempt in the main checkout
- calls verification "done" because the model said so
- copies code from products named in the PRD

Require an evidence pack in the description: test totals and a diff summary.
