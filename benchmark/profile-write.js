import {
  ref as nanoRef,
  computed as nanoComputed,
  effect as nanoEffect,
  nextTick as nanoNextTick,
} from "../src/reactive.js";
import {
  ref as vueRef,
  computed as vueComputed,
  watchEffect,
  nextTick as vueNextTick,
} from "vue";

const WRITE_COUNT = 100_000;
const RUNS = 5;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Correctness check failed: ${message}`);
  }
}

async function nanoNoSubscribers() {
  const r = nanoRef(0);

  const start = performance.now();
  for (let i = 0; i < WRITE_COUNT; i++) {
    r.value++;
  }
  const milliseconds = performance.now() - start;

  assert(r.value === WRITE_COUNT, "NanoReactive ref write result");
  return milliseconds;
}

async function vueNoSubscribers() {
  const r = vueRef(0);

  const start = performance.now();
  for (let i = 0; i < WRITE_COUNT; i++) {
    r.value++;
  }
  const milliseconds = performance.now() - start;

  assert(r.value === WRITE_COUNT, "Vue ref write result");
  return milliseconds;
}

async function nanoComputedInvalidation() {
  const r = nanoRef(0);
  const c = nanoComputed(() => r.value * 2);

  // Initialize the computed and subscribe it to r before timing.
  assert(c.value === 0, "NanoReactive computed initialization");

  const start = performance.now();
  for (let i = 0; i < WRITE_COUNT; i++) {
    r.value++;
  }
  const milliseconds = performance.now() - start;

  assert(c.value === WRITE_COUNT * 2, "NanoReactive computed invalidation");
  return milliseconds;
}

async function vueComputedInvalidation() {
  const r = vueRef(0);
  const c = vueComputed(() => r.value * 2);

  // Initialize the computed and subscribe it to r before timing.
  assert(c.value === 0, "Vue computed initialization");

  const start = performance.now();
  for (let i = 0; i < WRITE_COUNT; i++) {
    r.value++;
  }
  const milliseconds = performance.now() - start;

  assert(c.value === WRITE_COUNT * 2, "Vue computed invalidation");
  return milliseconds;
}

async function nanoEffectScheduling() {
  const r = nanoRef(0);
  let observed = -1;
  let effectRuns = 0;

  nanoEffect(() => {
    observed = r.value;
    effectRuns++;
  });

  const start = performance.now();
  for (let i = 0; i < WRITE_COUNT; i++) {
    r.value++;
  }
  const milliseconds = performance.now() - start;

  await nanoNextTick();
  assert(observed === WRITE_COUNT, "NanoReactive effect observed value");
  assert(effectRuns === 2, "NanoReactive effect batching");
  return milliseconds;
}

async function vueEffectScheduling() {
  const r = vueRef(0);
  let observed = -1;
  let effectRuns = 0;

  watchEffect(() => {
    observed = r.value;
    effectRuns++;
  });

  const start = performance.now();
  for (let i = 0; i < WRITE_COUNT; i++) {
    r.value++;
  }
  const milliseconds = performance.now() - start;

  await vueNextTick();
  assert(observed === WRITE_COUNT, "Vue effect observed value");
  assert(effectRuns === 2, "Vue effect batching");
  return milliseconds;
}

async function average(run) {
  await run();

  let total = 0;
  for (let i = 0; i < RUNS; i++) {
    total += await run();
  }
  return total / RUNS;
}

function opsPerSecond(milliseconds) {
  return WRITE_COUNT / (milliseconds / 1000);
}

const scenarios = [
  ["Ref no subscribers", nanoNoSubscribers, vueNoSubscribers],
  ["Ref → computed", nanoComputedInvalidation, vueComputedInvalidation],
  ["Ref → effect", nanoEffectScheduling, vueEffectScheduling],
];

const results = [];
for (const [name, nanoRun, vueRun] of scenarios) {
  const nanoMs = await average(nanoRun);
  const vueMs = await average(vueRun);
  results.push({
    name,
    nanoMs,
    vueMs,
    ratio: nanoMs / vueMs,
    nanoOps: opsPerSecond(nanoMs),
    vueOps: opsPerSecond(vueMs),
  });
}

console.log(`\nWrite-path diagnostic (${WRITE_COUNT.toLocaleString()} writes)`);
console.log(`${RUNS} measured runs + 1 warm-up per implementation\n`);
console.log(
  "Benchmark".padEnd(26) +
    "Nano ms".padStart(12) +
    "Vue ms".padStart(12) +
    "Nano/Vue".padStart(12),
);
console.log("-".repeat(62));

for (const result of results) {
  console.log(
    result.name.padEnd(26) +
      result.nanoMs.toFixed(2).padStart(12) +
      result.vueMs.toFixed(2).padStart(12) +
      result.ratio.toFixed(2).padStart(12),
  );
}

console.log("\nOps/sec:");
for (const result of results) {
  console.log(
    `${result.name.padEnd(26)}Nano ${Math.round(result.nanoOps).toLocaleString("en-US").padStart(12)}  ` +
      `Vue ${Math.round(result.vueOps).toLocaleString("en-US").padStart(12)}`,
  );
}

const noSubscribers = results[0];
const computed = results[1];
const effect = results[2];

console.log("\nInterpretation:");
console.log(
  `- Ref → computed is closest to the main benchmark's write-side invalidation path: ` +
    `${computed.ratio.toFixed(2)}x Nano/Vue.`,
);
console.log(
  `- With no subscribers, NanoReactive is ${noSubscribers.ratio.toFixed(2)}x the Vue write time.`,
);
console.log(
  `- The computed scenario is ${(computed.ratio / noSubscribers.ratio).toFixed(2)}x the ` +
    "no-subscriber Nano/Vue ratio, so most of that gap exists before triggering.",
);
console.log(
  `- Computed invalidation is ${computed.ratio > effect.ratio ? "more" : "less"} expensive than effect scheduling ` +
    `relative to Vue (${computed.ratio.toFixed(2)}x vs ${effect.ratio.toFixed(2)}x); ` +
    "effect scheduling still adds the batching/queueing path.",
);
