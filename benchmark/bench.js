import {
  ref as nanoRef,
  computed as nanoComputed,
  effect as nanoEffect,
  nextTick as nanoNextTick,
} from "../src/reactive.js";

// Vue's `effect` lives on @vue/reactivity and is not a supported public API
// of the `vue` package, so watchEffect is used as the closest public equivalent.
import {
  ref as vueRef,
  computed as vueComputed,
  watchEffect,
  nextTick as vueNextTick,
} from "vue";

const PAIR_COUNT = 10_000;
const WRITE_COUNT = 100_000;
const RUNS = 5;

/*
 * Workload
 *
 * Create 10,000 independent dependency chains:
 *
 *   ref -> computed -> effect
 *
 * Then perform 100,000 writes distributed across those refs.
 *
 * Each write invalidates only the computed/effect belonging to that pair.
 *
 * Setup is intentionally outside the timed section.
 * We want to measure update/invalidation performance, not object creation.
 */

async function runNano() {
  const refs = new Array(PAIR_COUNT);

  // Setup
  for (let i = 0; i < PAIR_COUNT; i++) {
    const r = nanoRef(0);
    const c = nanoComputed(() => r.value * 2);

    refs[i] = r;

    nanoEffect(() => {
      c.value;
    });
  }

  const writeStart = performance.now();

  for (let i = 0; i < WRITE_COUNT; i++) {
    refs[i % PAIR_COUNT].value++;
  }

  const writeTime = performance.now() - writeStart;

  const flushStart = performance.now();
  await nanoNextTick();
  const flushTime = performance.now() - flushStart;

  return {
    writeTime,
    flushTime,
    totalTime: writeTime + flushTime,
  };
}

async function runVue() {
  const refs = new Array(PAIR_COUNT);

  // Setup
  for (let i = 0; i < PAIR_COUNT; i++) {
    const r = vueRef(0);
    const c = vueComputed(() => r.value * 2);

    refs[i] = r;

    watchEffect(() => {
      c.value;
    });
  }

  const writeStart = performance.now();

  for (let i = 0; i < WRITE_COUNT; i++) {
    refs[i % PAIR_COUNT].value++;
  }

  const writeTime = performance.now() - writeStart;

  const flushStart = performance.now();
  await vueNextTick();
  const flushTime = performance.now() - flushStart;

  return {
    writeTime,
    flushTime,
    totalTime: writeTime + flushTime,
  };
}

async function average(label, run) {
  const samples = [];

  // Warm-up run
  await run();

  for (let i = 0; i < RUNS; i++) {
    samples.push(await run());
  }

  const writeTime =
    samples.reduce((sum, s) => sum + s.writeTime, 0) / RUNS;
  const flushTime =
    samples.reduce((sum, s) => sum + s.flushTime, 0) / RUNS;
  const totalTime =
    samples.reduce((sum, s) => sum + s.totalTime, 0) / RUNS;

  const opsPerSec = WRITE_COUNT / (totalTime / 1000);

  return {
    implementation: label,
    writeTime,
    flushTime,
    totalTime,
    opsPerSec,
    writePct: (writeTime / totalTime) * 100,
    flushPct: (flushTime / totalTime) * 100,
  };
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function padStart(value, width) {
  return String(value).padStart(width);
}

const results = [
  await average("NanoReactive", runNano),
  await average("Vue 3", runVue),
];

const colImpl = 16;
const colWrite = 16;
const colFlush = 16;
const colTotal = 16;
const colOps = 14;

console.log("\nNanoReactive vs Vue 3");
console.log(
  `${PAIR_COUNT.toLocaleString()} independent ref → computed → effect chains`,
);
console.log(`${WRITE_COUNT.toLocaleString()} writes per run`);
console.log(`${RUNS} measured runs + 1 warm-up\n`);

console.log(
  pad("implementation", colImpl) +
    pad("write time", colWrite) +
    pad("flush time", colFlush) +
    pad("total time", colTotal) +
    padStart("ops/sec", colOps),
);

console.log("-".repeat(colImpl + colWrite + colFlush + colTotal + colOps));

for (const row of results) {
  console.log(
    pad(row.implementation, colImpl) +
      pad(row.writeTime.toFixed(2) + " ms", colWrite) +
      pad(row.flushTime.toFixed(2) + " ms", colFlush) +
      pad(row.totalTime.toFixed(2) + " ms", colTotal) +
      padStart(
        Math.round(row.opsPerSec).toLocaleString("en-US"),
        colOps,
      ),
  );
}

console.log("\nShare of total time:");
for (const row of results) {
  console.log(
    `${row.implementation}: writes ${row.writePct.toFixed(1)}% / flush ${row.flushPct.toFixed(1)}%`,
  );
}

// Relative performance
const nano = results.find(
  (row) => row.implementation === "NanoReactive",
);

const vue = results.find(
  (row) => row.implementation === "Vue 3",
);

const ratio = vue.totalTime / nano.totalTime;

console.log("\nRelative performance:");

if (ratio > 1) {
  console.log(
    `NanoReactive is ${ratio.toFixed(2)}x faster than Vue 3 on this workload.`,
  );
} else {
  console.log(
    `Vue 3 is ${(1 / ratio).toFixed(2)}x faster than NanoReactive on this workload.`,
  );
}