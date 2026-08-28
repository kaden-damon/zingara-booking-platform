import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  capturePwaInstallPrompt,
  clearPwaInstallPrompt,
  subscribeToPwaInstallPrompt,
  type PwaInstallPromptEvent,
} from "./pwaInstallPrompt.ts";

test("retains an early install prompt for a later Quick Start subscriber", () => {
  clearPwaInstallPrompt();
  let prevented = false;
  const prompt = {
    preventDefault() {
      prevented = true;
    },
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  } as PwaInstallPromptEvent;

  capturePwaInstallPrompt(prompt);

  let received: PwaInstallPromptEvent | null = null;
  const unsubscribe = subscribeToPwaInstallPrompt((event) => {
    received = event;
  });

  assert.equal(prevented, true);
  assert.equal(received, prompt);

  unsubscribe();
  clearPwaInstallPrompt();
});

test("clearing the install prompt updates active subscribers", () => {
  const events: Array<PwaInstallPromptEvent | null> = [];
  const unsubscribe = subscribeToPwaInstallPrompt((event) => {
    events.push(event);
  });

  clearPwaInstallPrompt();

  assert.equal(events.at(-1), null);
  unsubscribe();
});
