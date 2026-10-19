---
name: mission-create
description: Create an AgentOS mission, tasks, and budget through the agentos CLI. Use when starting a unit of work that an external runtime will execute.
---

# Mission create

AgentOS does not plan or run an agent loop. Record the objective, then let a human start attempts.

1. Confirm the repo path is the main checkout, not a worktree.
2. Run `agentos repo add <path> --test "<command>"` if the repo is not registered.
3. Run `agentos mission create "<title>" --repo <path> --budget <usd> --criteria "<check>"`.
4. Run `agentos task add <mission> "<title>" --profile claude-default`.
5. Do not start the attempt unless the user asked. A budget is required before start.
6. Remind the user that policy is not a sandbox.
