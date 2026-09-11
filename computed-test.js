import { ref, computed } from "./src/reactive.js";

const price = ref(10);

let computeCount = 0;

const doubled = computed(() => {
    computeCount++;
    return price.value * 2;
});

console.log(doubled.value);
console.log("computeCount:", computeCount);

console.log(doubled.value);
console.log("computeCount:", computeCount);

price.value = 20;

console.log(doubled.value);
console.log("computeCount:", computeCount);