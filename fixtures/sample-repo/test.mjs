import assert from "node:assert/strict";
import { add, mul } from "./src/math.js";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok ${name}: ${error.message}`);
  }
}

check("add", () => assert.equal(add(2, 3), 5));
check("mul", () => assert.equal(mul(2, 3), 6));
if (failed) process.exit(1);
