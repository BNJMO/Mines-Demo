import { advanceMultiplier, resetMultiplier } from "../src/games/flip/FlipGame.js";

function mulberry32(seed) {
  return function prng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(rounds = 100000) {
  let wins = 0;
  let multiplier = resetMultiplier();
  const hist = new Map();
  const rng = mulberry32(Date.now());
  for (let i = 0; i < rounds; i++) {
    const outcome = rng() < 0.5 ? "heads" : "tails";
    const pick = rng() < 0.5 ? "heads" : "tails";
    if (outcome === pick) {
      wins += 1;
      multiplier = advanceMultiplier(multiplier);
    } else {
      multiplier = resetMultiplier();
    }
    hist.set(multiplier.toFixed(2), (hist.get(multiplier.toFixed(2)) || 0) + 1);
  }
  return { wins, rounds, hist };
}

function main() {
  const { wins, rounds, hist } = simulate();
  console.log("Flip stats over", rounds, "rounds");
  console.log("Win rate:", (wins / rounds * 100).toFixed(2) + "%");
  console.log("Top multipliers (sample):");
  Array.from(hist.entries())
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, 10)
    .forEach(([mult, count]) => {
      console.log(mult, count);
    });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
