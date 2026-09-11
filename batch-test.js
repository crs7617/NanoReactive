import { ref, effect, nextTick } from "./src/reactive.js";

const count = ref(0);

let runs = 0;

effect(() => {
    runs++;
    count.value;
});

count.value = 1;
count.value = 2;
count.value = 3;

console.log("Before flush:", runs);

await nextTick();

console.log("After flush:", runs);