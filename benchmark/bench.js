import {
  ref as nanoRef,
  computed as nanoComputed,
  effect as nanoEffect,
  nextTick as nanoNextTick,
} from "../src/reactive.js";
// Vue's `effect` lives on @vue/reactivity and is not a supported public API
// of the `vue` package — watchEffect is the equivalent subscription trigger.
import {
  ref as vueRef,
  computed as vueComputed,
  watchEffect,
  nextTick as vueNextTick,
} from "vue";

const PAIR_COUNT = 10_000;
const WRITE_COUNT = 100_000;
const RUNS = 3;

async function runNano() {
  const refs = new Array(PAIR_COUNT);
  const computeds = new Array(PAIR_COUNT);

  for (let i = 0; i < PAIR_COUNT; i++) {
    const r = nanoRef(0);
    const c = nanoComputed(() => r.value * 2);
    refs[i] = r;
    computeds[i] = c;
    nanoEffect(() => {
      c.value;
    });
  }

  const start = performance.now();
  for (let i = 0; i < WRITE_COUNT; i++) {
    refs[i % PAIR_COUNT].value++;
  }
  await nanoNextTick();
  return performance.now() - start;
}

async function runVue() {
  const refs = new Array(PAIR_COUNT);
  const computeds = new Array(PAIR_COUNT);

  for (let i = 0; i < PAIR_COUNT; i++) {
    const r = vueRef(0);
    const c = vueComputed(() => r.value * 2);
    refs[i] = r;
    computeds[i] = c;
    watchEffect(() => {
      c.value;
    });
  }

  const start = performance.now();
  for (let i = 0; i < WRITE_COUNT; i++) {
    refs[i % PAIR_COUNT].value++;
  }
  await vueNextTick();
  return performance.now() - start;
}

async function average(label, run) {
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    times.push(await run());
  }
  const totalTime = times.reduce((a, b) => a + b, 0) / RUNS;
  const opsPerSec = WRITE_COUNT / (totalTime / 1000);
  return { implementation: label, totalTime, opsPerSec, times };
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
const colTime = 18;
const colOps = 14;

console.log(
  pad("implementation", colImpl) +
    pad("total time (ms)", colTime) +
    pad("ops/sec", colOps),
);
console.log("-".repeat(colImpl + colTime + colOps));

for (const row of results) {
  console.log(
    pad(row.implementation, colImpl) +
      pad(row.totalTime.toFixed(2), colTime) +
      padStart(Math.round(row.opsPerSec).toLocaleString("en-US"), colOps),
  );
}
