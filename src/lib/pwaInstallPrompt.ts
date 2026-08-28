export type PwaInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallPromptListener = (event: PwaInstallPromptEvent | null) => void;

let pendingInstallPrompt: PwaInstallPromptEvent | null = null;
const installPromptListeners = new Set<InstallPromptListener>();

function notifyInstallPromptListeners() {
  for (const listener of installPromptListeners) {
    listener(pendingInstallPrompt);
  }
}

export function capturePwaInstallPrompt(event: Event) {
  event.preventDefault();
  pendingInstallPrompt = event as PwaInstallPromptEvent;
  notifyInstallPromptListeners();
}

export function clearPwaInstallPrompt() {
  pendingInstallPrompt = null;
  notifyInstallPromptListeners();
}

export function subscribeToPwaInstallPrompt(listener: InstallPromptListener) {
  installPromptListeners.add(listener);
  listener(pendingInstallPrompt);

  return () => {
    installPromptListeners.delete(listener);
  };
}
