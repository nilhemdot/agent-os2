import { run } from "./main.js";
import { processIO } from "./io.js";

run(process.argv.slice(2), processIO()).then(
  (code) => { process.exitCode = code; },
  (e) => { process.stderr.write(`unexpected error: ${(e as Error).message}\n`); process.exitCode = 2; },
);
