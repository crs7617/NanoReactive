import { ref, effect } from './src/reactive.js';

const count = ref(0);

let runs = 0;

effect(() => {
    runs++;
    console.log("count is:", count.value);
});

count.value = 1;
count.value = 2;

console.log("total runs:", runs);