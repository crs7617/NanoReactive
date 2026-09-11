// WeakMap<target, Map<key, Set<effect>>>
//
// WHY (not a strong Map): the dep graph must not keep targets alive.
// If we stored deps in a regular Map keyed by the ref/reactive object,
// dropping every user-facing reference would still leave the object in
// the Map, so it could never be garbage collected (a memory leak).
// WeakMap lets the GC collect a target once nothing else points at it.
// The nested Map<key, Set<effect>> is one target, many property keys:
// reactive() tracks each property independently; ref() only has one, so
// we key it by a per-ref internal object and the fixed key "value".
const targetMap = new WeakMap();

const VALUE_KEY = "value";

/** The effect currently executing, or null when nothing is tracking. */
let activeEffect = null;
/** Stack so nested effects restore the outer effect when they finish. */
const effectStack = [];

// Batched effect queue: several sync writes (count.value = 1; count.value = 2)
// should re-run each affected effect once, not once per write.
const queuedEffects = new Set();
let awaitingFlush = false;
/** Promise that settles after the currently scheduled flush, or null. */
let currentFlush = null;

function track(target, key) {
  if (!activeEffect) return;

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }

  dep.add(activeEffect);
  // Record this dep Set on the effect so cleanup() can unsubscribe later.
  activeEffect.deps.add(dep);
}

function trigger(target, key) {
  const depsMap = targetMap.get(target);
  if (!depsMap) return;

  const dep = depsMap.get(key);
  if (!dep || dep.size === 0) return;

  // Effects are queued for the later flush, so cleanup/re-tracking cannot
  // mutate this dependency Set while it is being traversed.
  for (const effectFn of dep) {
    // WHY self-trigger guard: if effect A is running and writes a ref that
    // A itself depends on, invoking A from this trigger would re-enter A
    // in the middle of its own execution. A typical loop is
    //   effect(() => { count.value++ })
    // which would recurse until the stack overflows. Skip the currently
    // running effect; it will see its own write via the rest of this run.
    if (effectFn === activeEffect) continue;

    // Computed (and other lazy subscribers) set .scheduler so a dep
    // change only marks them stale — they recompute on the next read.
    // Schedulers stay synchronous so dirty flags land before we queue
    // the downstream effects that will read those computeds.
    if (effectFn.scheduler) {
      effectFn.scheduler();
    } else {
      queueEffect(effectFn);
    }
  }
}

function queueEffect(effectFn) {
  queuedEffects.add(effectFn);
  scheduleFlush();
}

function scheduleFlush() {
  if (awaitingFlush) return;
  awaitingFlush = true;
  currentFlush = new Promise((resolve, reject) => {
    queueMicrotask(() => {
      try {
        flushQueue();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        awaitingFlush = false;
        currentFlush = null;
      }
    });
  });
}

function flushQueue() {
  // Drain in a loop so effects that write during the flush still run in
  // this same microtask instead of scheduling a second one.
  while (queuedEffects.size > 0) {
    const jobs = [...queuedEffects];
    queuedEffects.clear();
    for (const effectFn of jobs) {
      if (effectFn !== activeEffect) {
        effectFn();
      }
    }
  }
}

/** Await the pending effect flush (or resolve immediately if none). */
export function nextTick() {
  return currentFlush ?? Promise.resolve();
}

function cleanup(effectFn) {
  // WHY stale-dep cleanup: an effect's set of reads can change between
  // runs (e.g. `if (ok.value) n.value`). Without clearing old subscriptions
  // first, the effect would stay registered on refs it no longer reads, and
  // would keep re-running for irrelevant writes (wasted work, and often
  // wrong when the branch is meant to be "off").
  for (const dep of effectFn.deps) {
    dep.delete(effectFn);
  }
  effectFn.deps.clear();
}

function runEffect(effectFn, fn) {
  cleanup(effectFn);
  effectStack.push(effectFn);
  activeEffect = effectFn;
  try {
    fn();
  } finally {
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1] ?? null;
  }
}

export function effect(fn) {
  const runner = () => runEffect(runner, fn);
  // Each effect tracks the dep Sets it currently belongs to.
  runner.deps = new Set();
  runner();
  return runner;
}

export function computed(getter) {
  // dirty-flag / lazy cache:
  //   dirty === true  → cached value is missing or stale; run getter on next read
  //   dirty === false → cached value is still valid; skip getter
  // Start dirty so we do not run getter until something actually reads .value.
  let dirty = true;
  let value;
  // Separate target so effects that read this computed subscribe to *us*,
  // not to the inner refs the getter happens to touch.
  const target = {};

  const runner = () =>
    runEffect(runner, () => {
      value = getter();
    });
  runner.deps = new Set();
  // Called by trigger() when an inner dep changes — do not re-run getter here.
  runner.scheduler = () => {
    // WHY lazy (dirty flag): recomputing on every dep write is wasted if
    // nobody reads this computed again. Mark stale and notify *our*
    // subscribers; the getter runs only when .value is next accessed.
    // The `if (!dirty)` guard also collapses multiple dep writes between
    // reads into a single invalidation / trigger.
    if (!dirty) {
      dirty = true;
      trigger(target, VALUE_KEY);
    }
  };

  return {
    get value() {
      // WHY cache: if no dependency has changed since the last evaluation,
      // getter() would produce the same result — return the stored value.
      if (dirty) {
        runner();
        dirty = false;
      }
      // Make this computed a tracked dep of the currently running effect
      // (or of another computed that is evaluating). That is what makes
      // computed composable with effect() and with other computeds.
      track(target, VALUE_KEY);
      return value;
    },
  };
}

export function ref(initialValue) {
  let value = initialValue;
  const dep = new Set();

  return {
    get value() {
      if (activeEffect) {
        dep.add(activeEffect);
        activeEffect.deps.add(dep);
      }
      return value;
    },
    set value(newValue) {
      value = newValue;
      if (dep.size === 0) return;

      const effects = [...dep];
      for (const effectFn of effects) {
        if (effectFn === activeEffect) continue;

        if (effectFn.scheduler) {
          effectFn.scheduler();
        } else {
          queueEffect(effectFn);
        }
      }
    },
  };
}

export function reactive(target) {
  // KNOWN LIMITATION: array mutating methods (push, splice, pop, …) are
  // not special-cased. Those methods write several keys (indices + length)
  // in ways a plain set trap does not fully observe as "the list changed",
  // so effects that iterate an array or read .length may miss updates.
  return new Proxy(target, {
    get(obj, key, receiver) {
      track(obj, key);
      return Reflect.get(obj, key, receiver);
    },
    set(obj, key, newValue, receiver) {
      const result = Reflect.set(obj, key, newValue, receiver);
      trigger(obj, key);
      return result;
    },
  });
}
