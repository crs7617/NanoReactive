import { reactive, effect } from "./src/reactive.js";

const state = reactive({ a: 1, b: 2 });

let aRuns = 0;

effect(() => {
    aRuns++;
    state.a;
});

state.b = 999;

console.log("After changing b:", aRuns);

state.a = 2;

console.log("After changing a:", aRuns);