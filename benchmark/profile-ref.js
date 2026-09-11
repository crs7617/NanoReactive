import { ref as nanoRef } from "../src/reactive.js";
import { ref as vueRef } from "vue";

const ITERATIONS = 10_000_000;
const RUNS = 5;
let sink = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Correctness check failed: ${message}`);
  }
}

function createPlainRef(initialValue) {
  let value = initialValue;
  return {
    get value() {
      return value;
    },
    set value(nextValue) {
      value = nextValue;
    },
  };
}

function measureGetter(createRef) {
  const r = createRef(0);
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    sink = r.value;
  }
  return performance.now() - start;
}

function measureSetter(createRef) {
  const r = createRef(0);
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    r.value = i;
  }
  return performance.now() - start;
}

function measureReadWrite(createRef) {
  const r = createRef(0);
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    r.value = r.value + 1;
  }
  return performance.now() - start;
}

function checkGetter(createRef, label) {
  const r = createRef(0);
  let result = 0;
  for (let i = 0; i < 10; i++) {
    result = r.value;
  }
  assert(result === 0, `${label} getter result`);
}

function checkSetter(createRef, label) {
  const r = createRef(0);
  for (let i = 0; i < 10; i++) {
    r.value = i;
  }
  assert(r.value === 9, `${label} setter result`);
}

function checkReadWrite(createRef, label) {
  const r = createRef(0);
  for (let i = 0; i < 10; i++) {
    r.value = r.value + 1;
  }
  assert(r.value === 10, `${label} read/write result`);
}

const implementations = [
  ["Plain JS", createPlainRef],
  ["NanoReactive", nanoRef],
  ["Vue 3", vueRef],
];

const scenarios = [
  ["Getter", measureGetter, checkGetter],
  ["Setter", measureSetter, checkSetter],
  ["Read + write", measureReadWrite, checkReadWrite],
];

function opsPerSecond(milliseconds) {
  return ITERATIONS / (milliseconds / 1000);
}

function average(measure, createRef) {
  measure(createRef);

  let total = 0;
  for (let i = 0; i < RUNS; i++) {
    total += measure(createRef);
  }
  return total / RUNS;
}

const results = [];
for (const [scenario, measure, check] of scenarios) {
  const row = { scenario };
  for (const [label, createRef] of implementations) {
    check(createRef, label);
    row[label] = average(measure, createRef);
  }
  results.push(row);
}

console.log(`\nRef representation diagnostic (${ITERATIONS.toLocaleString()} iterations)`);
console.log(`${RUNS} measured runs + 1 warm-up per implementation\n`);
console.log(
  "Benchmark".padEnd(22) +
    "Plain JS".padStart(14) +
    "NanoReactive".padStart(16) +
    "Vue 3".padStart(12),
);
console.log("-".repeat(64));

for (const result of results) {
  console.log(
    result.scenario.padEnd(22) +
      result["Plain JS"].toFixed(2).padStart(14) +
      result.NanoReactive.toFixed(2).padStart(16) +
      result["Vue 3"].toFixed(2).padStart(12),
  );
}

console.log("\nOps/sec:");
for (const result of results) {
  console.log(
    `${result.scenario.padEnd(22)}Plain ${Math.round(opsPerSecond(result["Plain JS"])).toLocaleString("en-US").padStart(12)}  ` +
      `Nano ${Math.round(opsPerSecond(result.NanoReactive)).toLocaleString("en-US").padStart(12)}  ` +
      `Vue ${Math.round(opsPerSecond(result["Vue 3"])).toLocaleString("en-US").padStart(12)}`,
  );
}

const getter = results[0];
const setter = results[1];
const readWrite = results[2];

console.log("\nInterpretation:");
console.log(
  `- NanoReactive getter: ${(getter.NanoReactive / getter["Plain JS"]).toFixed(2)}x plain JS; ` +
    `setter: ${(setter.NanoReactive / setter["Plain JS"]).toFixed(2)}x plain JS.`,
);
console.log(
  `- NanoReactive read + write: ${(readWrite.NanoReactive / readWrite["Plain JS"]).toFixed(2)}x plain JS.`,
);
console.log(
  "- These ratios show how much overhead remains after removing subscribers and effect scheduling; " +
    "the dependency lookup path is exercised only when tracking is active.",
);
console.log(
  "- Compare the getter and setter gaps separately: a large setter-only gap supports investigating " +
    "ref setter and trigger bookkeeping, while a large getter-only gap points to ref access itself.",
);

// Keep the getter result observable across benchmark implementations.
assert(typeof sink === "number", "benchmark sink");
