// WeakMap<target, Map<key, Set<effect>>>
//
// WHY (not a strong Map): the dep graph must not keep targets alive.
// If we stored deps in a regular Map keyed by the ref/reactive object,
// dropping every user-facing reference would still leave the object in
// the Map, so it could never be garbage collected (a memory leak).
// WeakMap lets the GC collect a target once nothing else points at it.
// The nested Map<key, Set<effect>> is the same shape reactive() will need
// later (one target, many property keys). ref() only has one property, so
// we key it by a per-ref internal object and the fixed key "value".
const targetMap = new WeakMap();

const VALUE_KEY = "value";

/** The effect currently executing, or null when nothing is tracking. */
let activeEffect = null;
/** Stack so nested effects restore the outer effect when they finish. */
const effectStack = [];

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

  // Snapshot: an effect may unsubscribe/resubscribe while we iterate.
  const effects = [...dep];
  for (const effectFn of effects) {
    // WHY self-trigger guard: if effect A is running and writes a ref that
    // A itself depends on, invoking A from this trigger would re-enter A
    // in the middle of its own execution. A typical loop is
    //   effect(() => { count.value++ })
    // which would recurse until the stack overflows. Skip the currently
    // running effect; it will see its own write via the rest of this run.
    if (effectFn !== activeEffect) {
      effectFn();
    }
  }
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

export function ref(initialValue) {
  // Internal target object: WeakMap key, same storage shape as reactive().
  const target = { [VALUE_KEY]: initialValue };

  return {
    get value() {
      track(target, VALUE_KEY);
      return target[VALUE_KEY];
    },
    set value(newValue) {
      target[VALUE_KEY] = newValue;
      trigger(target, VALUE_KEY);
    },
  };
}
