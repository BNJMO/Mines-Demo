import assert from "node:assert";
import { advanceMultiplier, resetMultiplier, DEFAULT_GROWTH_FACTOR } from "../src/games/flip/FlipGame.js";

function testMultiplierGrows() {
  const start = resetMultiplier();
  const next = advanceMultiplier(start, DEFAULT_GROWTH_FACTOR);
  assert.strictEqual(Number(next.toFixed(2)), Number((start * DEFAULT_GROWTH_FACTOR).toFixed(2)));
}

function testMultiplierResets() {
  let multiplier = 10;
  multiplier = resetMultiplier();
  assert.strictEqual(multiplier, 2);
}

function run() {
  testMultiplierGrows();
  testMultiplierResets();
  console.log("All flip tests passed");
}

if (import.meta.url === new URL(process.argv[1], `file://${process.cwd()}/`).href) {
  run();
}

export { run };
