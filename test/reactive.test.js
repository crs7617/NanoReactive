import { describe, expect, it } from "vitest";
import { computed, effect, nextTick, ref } from "../src/reactive.js";

describe("effect dependencies", () => {
  it("keeps stable dependencies subscribed across runs", async () => {
    const first = ref(0);
    const second = ref(0);
    let runs = 0;

    effect(() => {
      first.value;
      second.value;
      runs++;
    });

    expect(runs).toBe(1);

    first.value++;
    await nextTick();
    expect(runs).toBe(2);

    second.value++;
    await nextTick();
    expect(runs).toBe(3);
  });

  it("removes stale conditional dependencies", async () => {
    const flag = ref(true);
    const conditional = ref(0);
    let runs = 0;

    effect(() => {
      flag.value;
      if (flag.value) {
        conditional.value;
      }
      runs++;
    });

    flag.value = false;
    await nextTick();
    expect(runs).toBe(2);

    conditional.value++;
    await nextTick();
    expect(runs).toBe(2);
  });

  it("preserves nested effect tracking", async () => {
    const outerValue = ref(0);
    const innerValue = ref(0);
    let outerRuns = 0;
    let innerRuns = 0;
    let innerCreated = false;

    effect(() => {
      outerValue.value;
      outerRuns++;
      if (!innerCreated) {
        innerCreated = true;
        effect(() => {
          innerValue.value;
          innerRuns++;
        });
      }
    });

    outerValue.value++;
    await nextTick();
    expect(outerRuns).toBe(2);
    expect(innerRuns).toBe(1);

    innerValue.value++;
    await nextTick();
    expect(innerRuns).toBe(2);
  });

  it("caches computed values", () => {
    const source = ref(1);
    let getterRuns = 0;
    const doubled = computed(() => {
      getterRuns++;
      return source.value * 2;
    });

    expect(doubled.value).toBe(2);
    expect(doubled.value).toBe(2);
    expect(getterRuns).toBe(1);
  });

  it("invalidates computed values after source changes", () => {
    const source = ref(1);
    const doubled = computed(() => source.value * 2);

    expect(doubled.value).toBe(2);
    source.value = 3;
    expect(doubled.value).toBe(6);
  });

  it("tracks computed values in effects", async () => {
    const source = ref(1);
    const doubled = computed(() => source.value * 2);
    const values = [];

    effect(() => {
      values.push(doubled.value);
    });

    source.value = 2;
    await nextTick();
    expect(values).toEqual([2, 4]);
  });

  it("composes computed values", () => {
    const source = ref(1);
    const doubled = computed(() => source.value * 2);
    const quadrupled = computed(() => doubled.value * 2);

    expect(quadrupled.value).toBe(4);
    source.value = 3;
    expect(quadrupled.value).toBe(12);
  });

  it("supports multiple effects consuming one computed", async () => {
    const source = ref(1);
    const doubled = computed(() => source.value * 2);
    let firstRuns = 0;
    let secondRuns = 0;

    effect(() => {
      doubled.value;
      firstRuns++;
    });
    effect(() => {
      doubled.value;
      secondRuns++;
    });

    source.value = 2;
    await nextTick();
    expect(firstRuns).toBe(2);
    expect(secondRuns).toBe(2);
  });
});