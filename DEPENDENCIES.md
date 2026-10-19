# Dependencies

AgentOS runtime code uses Node.js built-ins only (`node:sqlite`, `node:http`, `node:child_process`, `node:crypto`, `node:fs`, `node:path`). There is no database driver package and no YAML package. The policy package has no third-party dependencies.

Direct dependencies, and the license recorded in each installed package:

| Package | Version | Use | License |
| --- | --- | --- | --- |
| react | 19.1.1 | Mission Control UI | MIT |
| react-dom | 19.1.1 | Mission Control UI | MIT |
| vite | 6.3.6 | UI build | MIT |
| @vitejs/plugin-react | 5.0.4 | UI build | MIT |
| typescript | 5.9.3 | Typecheck tooling | Apache-2.0 |
| vitest | 3.2.4 | Unit and acceptance tests | MIT |
| @vitest/coverage-v8 | 3.2.4 | Coverage | MIT |
| @playwright/test | 1.56.1 | Browser smoke test | Apache-2.0 |
| @types/react | 19.1.13 | UI types | MIT |
| @types/react-dom | 19.1.9 | UI types | MIT |

All of these are permissive (MIT or Apache-2.0). No dependency is copied from the products named in the PRD. Transitive packages are installed by npm from these direct dependencies; their licenses are in `package-lock.json` and each package's own `LICENSE` file.
