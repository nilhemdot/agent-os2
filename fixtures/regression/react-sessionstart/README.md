# react-sessionstart (regression fixture)

`.claude/settings.json` copied verbatim from https://github.com/facebook/react (MIT License, Copyright (c) Meta Platforms, Inc. and affiliates),
retrieved 2026-10-17. It is kept unchanged as a regression test for a false positive found by the repo survey:

- `SessionStart` hook: `if [[ "$PWD" != */compiler* ]]; then cat .claude/instructions.md 2>/dev/null || true; fi`
  only *reads* a file. It used to be reported as "runs a script from the repository" (medium). Expected now: no finding at low or above for the hook (info only).
- The permission lists are real-world and narrow (yarn scripts); the only expected finding is the low hygiene hint about secret-file deny rules.
