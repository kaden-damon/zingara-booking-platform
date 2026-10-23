export type VisiblePollingEnvironment = {
  addFocusListener: (listener: () => void) => void;
  addVisibilityListener: (listener: () => void) => void;
  clearTimer: (timer: number) => void;
  isVisible: () => boolean;
  now: () => number;
  removeFocusListener: (listener: () => void) => void;
  removeVisibilityListener: (listener: () => void) => void;
  setTimer: (
    listener: () => void,
    delayMs: number,
  ) => number;
};

type VisiblePollingOptions = {
  environment?: VisiblePollingEnvironment;
  immediate?: boolean;
  minimumResumeGapMs?: number;
};

function getBrowserEnvironment(): VisiblePollingEnvironment {
  return {
    addFocusListener: (listener) => window.addEventListener("focus", listener),
    addVisibilityListener: (listener) =>
      document.addEventListener("visibilitychange", listener),
    clearTimer: (timer) => window.clearTimeout(timer),
    isVisible: () => document.visibilityState === "visible",
    now: () => Date.now(),
    removeFocusListener: (listener) =>
      window.removeEventListener("focus", listener),
    removeVisibilityListener: (listener) =>
      document.removeEventListener("visibilitychange", listener),
    setTimer: (listener, delayMs) => window.setTimeout(listener, delayMs),
  };
}

export function startVisiblePolling(
  task: () => Promise<unknown> | unknown,
  intervalMs: number,
  options: VisiblePollingOptions = {},
) {
  const environment = options.environment ?? getBrowserEnvironment();
  const minimumResumeGapMs = options.minimumResumeGapMs ?? 1_000;
  let active = true;
  let inFlight = false;
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let timer: number | null = null;

  const clearScheduledRun = () => {
    if (timer !== null) {
      environment.clearTimer(timer);
      timer = null;
    }
  };

  const schedule = (delayMs = intervalMs) => {
    clearScheduledRun();
    if (!active || !environment.isVisible()) return;
    timer = environment.setTimer(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  const run = async () => {
    if (!active || inFlight || !environment.isVisible()) return;

    const elapsed = environment.now() - lastStartedAt;
    if (elapsed < minimumResumeGapMs) {
      schedule(minimumResumeGapMs - elapsed);
      return;
    }

    inFlight = true;
    lastStartedAt = environment.now();
    try {
      await task();
    } finally {
      inFlight = false;
      schedule();
    }
  };

  const resume = () => {
    if (!environment.isVisible()) {
      clearScheduledRun();
      return;
    }
    void run();
  };

  environment.addFocusListener(resume);
  environment.addVisibilityListener(resume);

  if (options.immediate === false) {
    schedule();
  } else {
    void run();
  }

  return () => {
    active = false;
    clearScheduledRun();
    environment.removeFocusListener(resume);
    environment.removeVisibilityListener(resume);
  };
}
