---
name: adapter-scaffold
description: Generate a failing AgentOS runtime adapter package from the shared contract. Use when adding a new runtime behind the adapter interface.
---

# Adapter scaffold

Run from the repository root:

```bash
node scripts/adapter-scaffold.mjs <runtime-name>
```

The script writes `packages/adapter-<name>/` with a stub that returns `not_supported` for every operation and a contract test that fails with "not implemented". Do not make those tests pass by deleting them. Implement the contract, then point the tests at a fake runtime. Do not copy another product's client.
