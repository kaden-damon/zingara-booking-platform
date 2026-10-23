import assert from "node:assert/strict";
import test from "node:test";
import {
  startVisiblePolling,
  type VisiblePollingEnvironment,
} from "./visiblePolling.ts";

function createEnvironment() {
  let visible = true;
  let now = 0;
  let nextTimerId = 1;
  const focusListeners = new Set<() => void>();
  const visibilityListeners = new Set<() => void>();
  const timers = new Map<number, { listener: () => void; runAt: number }>();

  const environment: VisiblePollingEnvironment = {
    addFocusListener: (listener) => focusListeners.add(listener),
    addVisibilityListener: (listener) => visibilityListeners.add(listener),
    clearTimer: (timer) => timers.delete(timer),
    isVisible: () => visible,
    now: () => now,
    removeFocusListener: (listener) => focusListeners.delete(listener),
    removeVisibilityListener: (listener) => visibilityListeners.delete(listener),
    setTimer: (listener, delayMs) => {
      const id = nextTimerId++;
      timers.set(id, { listener, runAt: now + delayMs });
      return id;
    },
  };

  return {
    advance(milliseconds: number) {
      now += milliseconds;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.runAt <= now)
        .sort((left, right) => left[1].runAt - right[1].runAt);
      for (const [id, timer] of due) {
        timers.delete(id);
        timer.listener();
      }
    },
    environment,
    focus() {
      for (const listener of focusListeners) listener();
    },
    setVisible(nextVisible: boolean) {
      visible = nextVisible;
      for (const listener of visibilityListeners) listener();
    },
    timerCount: () => timers.size,
  };
}

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("visible polling pauses while hidden and refreshes immediately on resume", async () => {
  const fake = createEnvironment();
  let runs = 0;
  const stop = startVisiblePolling(() => {
    runs += 1;
  }, 15_000, { environment: fake.environment });

  await flushTasks();
  assert.equal(runs, 1);
  assert.equal(fake.timerCount(), 1);

  fake.setVisible(false);
  fake.advance(60_000);
  await flushTasks();
  assert.equal(runs, 1);
  assert.equal(fake.timerCount(), 0);

  fake.setVisible(true);
  await flushTasks();
  assert.equal(runs, 2);
  assert.equal(fake.timerCount(), 1);
  stop();
});

test("focus and visibility events do not overlap or duplicate a recent run", async () => {
  const fake = createEnvironment();
  let resolveTask: (() => void) | undefined;
  let runs = 0;
  const stop = startVisiblePolling(
    () => {
      runs += 1;
      return new Promise<void>((resolve) => {
        resolveTask = resolve;
      });
    },
    30_000,
    { environment: fake.environment },
  );

  fake.focus();
  fake.setVisible(true);
  assert.equal(runs, 1);

  resolveTask?.();
  await flushTasks();
  fake.focus();
  await flushTasks();
  assert.equal(runs, 1);

  fake.advance(1_000);
  await flushTasks();
  assert.equal(runs, 2);
  stop();
});

test("cleanup cancels scheduled work and removes resume listeners", async () => {
  const fake = createEnvironment();
  let runs = 0;
  const stop = startVisiblePolling(() => {
    runs += 1;
  }, 10_000, { environment: fake.environment });

  await flushTasks();
  stop();
  fake.advance(30_000);
  fake.focus();
  fake.setVisible(false);
  fake.setVisible(true);
  await flushTasks();
  assert.equal(runs, 1);
  assert.equal(fake.timerCount(), 0);
});
