import { ref, effect } from './src/reactive.js';

const flag = ref(true);
const a = ref("A");
const b = ref("B");
let log = [];

effect(() => {
  log.push(flag.value ? a.value : b.value);
});

flag.value = false; // now reading b, not a
a.value = "A-changed"; // should NOT trigger the effect anymore — if it does, cleanup is broken
console.log(log); // should be ["A", "B"] — NOT ["A", "B", "B"]