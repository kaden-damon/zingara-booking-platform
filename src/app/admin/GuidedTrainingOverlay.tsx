"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  guidedTrainingModules,
  isGuidedTrainingModuleId,
  type GuidedTrainingModuleId,
} from "@/lib/guidedTraining";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

type StoredProgress = {
  completedAt?: string;
  currentStep: number;
  moduleId: GuidedTrainingModuleId;
  moduleVersion: number;
  status: "completed" | "in-progress";
};

type ProgressBootstrap = {
  persistence: "academy" | "preview-session";
  progress: Array<{
    current_step: number;
    module_id: GuidedTrainingModuleId;
    module_version: number;
    status: "completed" | "in-progress";
  }>;
};

const storageKey = "zingara-guided-training:local-management-preview";
const guideGap = 12;
const viewportInset = 12;

type LocalRunState = {
  moduleId: GuidedTrainingModuleId;
  moduleVersion: number;
  prepared: boolean;
  retake: boolean;
  stepIndex: number;
};

function runStorageKey(moduleId: GuidedTrainingModuleId) {
  return `zingara-guided-training:run:${moduleId}`;
}

function readRunState(moduleId: GuidedTrainingModuleId, moduleVersion: number) {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(runStorageKey(moduleId)) ?? "null",
    ) as LocalRunState | null;
    return parsed?.moduleVersion === moduleVersion ? parsed : null;
  } catch {
    return null;
  }
}

function writeRunState(state: LocalRunState) {
  sessionStorage.setItem(runStorageKey(state.moduleId), JSON.stringify(state));
}

function clearRunState(moduleId: GuidedTrainingModuleId) {
  sessionStorage.removeItem(runStorageKey(moduleId));
}

function controlValue(control: Element) {
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    return control.checked ? "checked" : "unchecked";
  }
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ) {
    return control.value;
  }
  return (control as HTMLElement).dataset.trainingValue ?? "";
}

function visibleViewport() {
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0;
  const height = viewport?.height ?? window.innerHeight;
  return {
    bottom: top + height - viewportInset,
    height,
    top: top + viewportInset,
  };
}

function findVisibleTrainingElement(attribute: "control" | "scope", controlId: string) {
  const candidates = document.querySelectorAll<Element>(
    `[data-training-${attribute}="${controlId}"]`,
  );
  return Array.from(candidates).find((candidate) => {
    const candidateRect = candidate.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    return (
      candidateRect.width > 0 &&
      candidateRect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      !candidate.closest('[aria-hidden="true"]')
    );
  });
}

function readStoredProgress(moduleId: GuidedTrainingModuleId, moduleVersion: number) {
  try {
    const rows = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as StoredProgress[];
    return rows.find(
      (row) => row.moduleId === moduleId && row.moduleVersion === moduleVersion,
    );
  } catch {
    return undefined;
  }
}

function writeStoredProgress(progress: StoredProgress) {
  let rows: StoredProgress[] = [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as StoredProgress[];
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    rows = [];
  }
  sessionStorage.setItem(
    storageKey,
    JSON.stringify([
      ...rows.filter(
        (row) =>
          !(row.moduleId === progress.moduleId && row.moduleVersion === progress.moduleVersion),
      ),
      progress,
    ]),
  );
}

export function getActiveGuidedTrainingModule() {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("guidedTraining");
  return isGuidedTrainingModuleId(value) ? value : null;
}

export default function GuidedTrainingOverlay({
  moduleId,
}: {
  moduleId: GuidedTrainingModuleId;
}) {
  const router = useRouter();
  const trainingModule = useMemo(
    () => guidedTrainingModules.find((item) => item.id === moduleId)!,
    [moduleId],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [guideTop, setGuideTop] = useState(viewportInset);
  const [targetMissing, setTargetMissing] = useState(true);
  const [incorrect, setIncorrect] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [exiting, setExiting] = useState(false);
  const guideRef = useRef<HTMLElement | null>(null);
  const completedRecordRef = useRef(false);
  const retakeRef = useRef(false);
  const persistenceRef = useRef<ProgressBootstrap["persistence"] | null>(null);
  const completed = stepIndex >= trainingModule.steps.length;
  const step = trainingModule.steps[Math.min(stepIndex, trainingModule.steps.length - 1)];
  const activeControlId = !prepared && step.prepare
    ? step.prepare.controlId
    : step.controlId;
  const activeInstruction = !prepared && step.prepare
    ? step.prepare.instruction
    : step.instruction;

  useEffect(() => {
    const controller = new AbortController();
    void fetchSupabaseApi<ProgressBootstrap>(
      `/api/admin/training/guided?module=${encodeURIComponent(moduleId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then((payload) => {
        persistenceRef.current = payload.persistence;
        const exactSaved =
          payload.persistence === "preview-session"
            ? readStoredProgress(moduleId, trainingModule.version)
            : payload.progress.find(
                (row) =>
                  row.module_id === moduleId &&
                  row.module_version === trainingModule.version,
              );
        const historicalCompletion = payload.progress
          .filter((row) => row.module_id === moduleId && row.status === "completed")
          .sort((left, right) => right.module_version - left.module_version)[0];
        const saved = exactSaved ?? historicalCompletion;
        const localRun = readRunState(moduleId, trainingModule.version);
        const requestedRetake = new URLSearchParams(window.location.search).get("retake") === "1";
        const retaking = requestedRetake || Boolean(localRun?.retake);
        if (requestedRetake) {
          sessionStorage.removeItem(`zingara-guided-training:booking:${moduleId}`);
        }
        const savedStep = exactSaved
          ? "current_step" in saved
            ? saved.current_step
            : saved.currentStep
          : 0;
        completedRecordRef.current = saved?.status === "completed";
        retakeRef.current = retaking;
        const nextStep = retaking && localRun
          ? localRun.stepIndex
          : requestedRetake
            ? 0
            : exactSaved?.status === "in-progress"
              ? savedStep
              : 0;
        setPrepared(Boolean(retaking && localRun?.prepared));
        setStepIndex(Math.min(nextStep, trainingModule.steps.length - 1));
        if (retaking && !localRun) {
          writeRunState({
            moduleId,
            moduleVersion: trainingModule.version,
            prepared: false,
            retake: true,
            stepIndex: 0,
          });
        }
        setProgressReady(true);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setProgressError(
          loadError instanceof Error
            ? loadError.message
            : "Training progress could not be loaded.",
        );
      });
    return () => controller.abort();
  }, [moduleId, trainingModule.steps.length, trainingModule.version]);

  const saveProgress = useCallback(
    async (nextStep: number) => {
      const isComplete = nextStep >= trainingModule.steps.length;
      if (completedRecordRef.current && !isComplete) return;
      const progress: StoredProgress = {
        completedAt: isComplete ? new Date().toISOString() : undefined,
        currentStep: nextStep,
        moduleId,
        moduleVersion: trainingModule.version,
        status: isComplete ? "completed" : "in-progress",
      };
      if (persistenceRef.current === "preview-session") {
        writeStoredProgress(progress);
      }
      await fetchSupabaseApi<{ accepted: true }>(
        "/api/admin/training/guided",
        {
          body: {
            currentStep: nextStep,
            moduleId,
            moduleVersion: trainingModule.version,
            status: progress.status,
          },
          keepalive: true,
          method: "POST",
        },
      );
      if (isComplete) {
        completedRecordRef.current = true;
        retakeRef.current = false;
        clearRunState(moduleId);
      }
    },
    [moduleId, trainingModule.steps.length, trainingModule.version],
  );

  const persist = useCallback(
    (nextStep: number, nextPrepared = false) => {
      setIncorrect(false);
      setProgressError("");
      setPrepared(nextPrepared);
      setStepIndex(nextStep);
      writeRunState({
        moduleId,
        moduleVersion: trainingModule.version,
        prepared: nextPrepared,
        retake: retakeRef.current,
        stepIndex: nextStep,
      });
      void saveProgress(nextStep).catch((saveError) => {
        setProgressError(
          saveError instanceof Error
            ? saveError.message
            : "Training progress could not be saved.",
        );
      });
    },
    [moduleId, saveProgress, trainingModule.version],
  );

  const exitTraining = useCallback(async () => {
    setExiting(true);
    setProgressError("");
    try {
      await saveProgress(stepIndex);
      router.push("/admin?section=academy&academySection=guided-training");
    } catch (saveError) {
      setProgressError(
        saveError instanceof Error
          ? saveError.message
          : "Training progress could not be saved.",
      );
      setExiting(false);
    }
  }, [router, saveProgress, stepIndex]);

  const restartWorkflow = useCallback(() => {
    persist(0);
    window.dispatchEvent(new CustomEvent("zingara-guided-training-navigate", {
      detail: { controlId: trainingModule.steps[0].controlId, restart: true },
    }));
    if (window.location.pathname !== "/admin") {
      router.replace(`/admin?guidedTraining=${encodeURIComponent(moduleId)}`);
    }
  }, [moduleId, persist, router, trainingModule.steps]);

  const moveBack = useCallback(() => {
    const previousStepIndex = Math.max(0, stepIndex - 1);
    const previousStep = trainingModule.steps[previousStepIndex];
    persist(previousStepIndex);
    window.dispatchEvent(new CustomEvent("zingara-guided-training-navigate", {
      detail: { controlId: previousStep.controlId },
    }));
    const adminControl = previousStep.controlId === "training-calendar-create" ||
      previousStep.controlId.startsWith("training-booking-standard") ||
      previousStep.controlId.startsWith("training-booking-corporate") ||
      previousStep.controlId.startsWith("training-booking-buyout");
    if (adminControl && window.location.pathname !== "/admin") {
      router.push(`/admin?guidedTraining=${encodeURIComponent(moduleId)}`);
    }
  }, [moduleId, persist, router, stepIndex, trainingModule.steps]);

  const locate = useCallback(() => {
    if (completed) return;
    const target = findVisibleTrainingElement("control", activeControlId);
    const scope = findVisibleTrainingElement("scope", activeControlId);
    const highlightedElement = scope ?? target;
    setTargetMissing(!highlightedElement);
    if (!highlightedElement) {
      setRect(null);
      return;
    }

    const nextRect = highlightedElement.getBoundingClientRect();
    const viewport = visibleViewport();
    const guideHeight = Math.min(
      guideRef.current?.getBoundingClientRect().height ?? 164,
      Math.max(120, viewport.height - viewportInset * 2),
    );
    const targetTop = nextRect.top - 6;
    const targetBottom = nextRect.bottom + 6;
    const roomAbove = targetTop - viewport.top;
    const roomBelow = viewport.bottom - targetBottom;
    const minimumTop = viewport.top;
    const maximumTop = Math.max(minimumTop, viewport.bottom - guideHeight);
    const focusedControlNeedsClearance =
      target === document.activeElement &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement);
    const preferredTop =
      !focusedControlNeedsClearance &&
      (roomBelow >= guideHeight + guideGap || roomBelow >= roomAbove)
        ? targetBottom + guideGap
        : targetTop - guideHeight - guideGap;

    setRect(nextRect);
    setGuideTop(Math.min(maximumTop, Math.max(minimumTop, preferredTop)));
  }, [activeControlId, completed]);

  const showCurrentTarget = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      setIncorrect(false);
      const target =
        findVisibleTrainingElement("scope", activeControlId) ??
        findVisibleTrainingElement("control", activeControlId);
      if (!target) {
        window.dispatchEvent(new CustomEvent("zingara-guided-training-navigate", {
          detail: { controlId: activeControlId },
        }));
        return false;
      }
      target.scrollIntoView({ behavior, block: "center", inline: "nearest" });
      window.setTimeout(locate, behavior === "smooth" ? 420 : 0);
      return true;
    },
    [activeControlId, locate],
  );

  useEffect(() => {
    if (completed) return;
    let revealed = false;
    const reveal = () => {
      if (revealed || !showCurrentTarget("auto")) return;
      revealed = true;
      observer.disconnect();
    };
    const observer = new MutationObserver(reveal);
    observer.observe(document.body, { childList: true, subtree: true });
    const revealTimer = window.setTimeout(reveal, 0);
    return () => {
      revealed = true;
      window.clearTimeout(revealTimer);
      observer.disconnect();
    };
  }, [completed, showCurrentTarget, stepIndex]);

  useEffect(() => {
    if (completed || prepared || !step.prepare) return;
    const timer = window.setTimeout(() => {
      const prepareTarget = findVisibleTrainingElement("control", step.prepare!.controlId);
      const finalTarget = findVisibleTrainingElement("control", step.controlId);
      if (!prepareTarget && finalTarget) {
        setPrepared(true);
        writeRunState({
          moduleId,
          moduleVersion: trainingModule.version,
          prepared: true,
          retake: retakeRef.current,
          stepIndex,
        });
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [completed, moduleId, prepared, step, stepIndex, trainingModule.version]);

  useEffect(() => {
    if (completed) return;
    const initialLocate = window.setTimeout(locate, 0);
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(locate);
    resizeObserver.observe(document.documentElement);
    if (guideRef.current) resizeObserver.observe(guideRef.current);
    const visualViewport = window.visualViewport;
    let viewportRevealTimer = 0;
    let scrollFrame = 0;
    const handleScroll = () => {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(locate);
    };
    const handleVisualViewportChange = () => {
      locate();
      window.clearTimeout(viewportRevealTimer);
      viewportRevealTimer = window.setTimeout(() => {
        const target =
          findVisibleTrainingElement("scope", activeControlId) ??
          findVisibleTrainingElement("control", activeControlId);
        if (!target) return;
        const targetRect = target.getBoundingClientRect();
        const viewport = visibleViewport();
        const guideHeight = guideRef.current?.getBoundingClientRect().height ?? 164;
        const targetIsVisible =
          targetRect.top >= viewport.top && targetRect.bottom <= viewport.bottom;
        const guideFitsBesideTarget =
          targetRect.top - viewport.top >= guideHeight + guideGap ||
          viewport.bottom - targetRect.bottom >= guideHeight + guideGap;
        if (!targetIsVisible || !guideFitsBesideTarget) showCurrentTarget("auto");
      }, 120);
    };
    window.addEventListener("resize", handleVisualViewportChange);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("scrollend", locate, true);
    document.addEventListener("focusin", locate);
    document.addEventListener("focusout", handleVisualViewportChange);
    visualViewport?.addEventListener("resize", handleVisualViewportChange);
    visualViewport?.addEventListener("scroll", handleVisualViewportChange);
    return () => {
      window.clearTimeout(initialLocate);
      window.clearTimeout(viewportRevealTimer);
      window.cancelAnimationFrame(scrollFrame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleVisualViewportChange);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("scrollend", locate, true);
      document.removeEventListener("focusin", locate);
      document.removeEventListener("focusout", handleVisualViewportChange);
      visualViewport?.removeEventListener("resize", handleVisualViewportChange);
      visualViewport?.removeEventListener("scroll", handleVisualViewportChange);
    };
  }, [activeControlId, completed, locate, showCurrentTarget]);

  useEffect(() => {
    if (completed) return;
    if (step.key === "confirm") {
      const advanceAfterBookingCreation = () => persist(stepIndex + 1);
      window.addEventListener(
        "zingara-guided-training-completed",
        advanceAfterBookingCreation,
        { once: true },
      );
      return () =>
        window.removeEventListener(
          "zingara-guided-training-completed",
          advanceAfterBookingCreation,
        );
    }
    const advance = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }
      const expectedControlId = !prepared && step.prepare
        ? step.prepare.controlId
        : step.controlId;
      const expectedEvent = !prepared && step.prepare
        ? step.prepare.event
        : step.event ?? "click";
      if (event.type !== expectedEvent && !(event instanceof KeyboardEvent)) return;
      const visibleControl = findVisibleTrainingElement("control", expectedControlId);
      const matchedControl = event.composedPath()
        .filter((node): node is Element => node instanceof Element)
        .map((node) =>
          node.closest(`[data-training-control="${expectedControlId}"]`) ??
          (!visibleControl
            ? node.closest(`[data-training-scope="${expectedControlId}"]`)
            : null),
        )
        .find((node): node is Element => Boolean(node));
      if (!matchedControl) return;
      const validValues = !prepared && step.prepare
        ? step.prepare.validValues
        : step.validValues;
      if (validValues && !validValues.includes(controlValue(matchedControl))) {
        setIncorrect(true);
        window.setTimeout(() => setIncorrect(false), 650);
        return;
      }
      if (!prepared && step.prepare) {
        setPrepared(true);
        writeRunState({
          moduleId,
          moduleVersion: trainingModule.version,
          prepared: true,
          retake: retakeRef.current,
          stepIndex,
        });
        window.requestAnimationFrame(() => showCurrentTarget("smooth"));
        return;
      }
      persist(stepIndex + 1);
    };
    // Let the real Production handler run before recording training progress.
    // Advancing during capture can re-render an open modal before its React
    // onClick handler receives the event, especially in mobile Safari.
    const eventNames = new Set([
      step.event ?? "click",
      step.prepare?.event ?? "click",
      "keydown",
    ]);
    eventNames.forEach((eventName) => document.addEventListener(eventName, advance));
    return () =>
      eventNames.forEach((eventName) => document.removeEventListener(eventName, advance));
  }, [completed, moduleId, persist, prepared, showCurrentTarget, step, stepIndex, trainingModule.version]);

  useEffect(() => {
    if (completed || targetMissing) return;
    const guard = (event: MouseEvent) => {
      const guideRect = document
        .querySelector<HTMLElement>("[data-training-guide]")
        ?.getBoundingClientRect();
      if (
        (event.target instanceof Node &&
          document.querySelector("[data-training-guide]")?.contains(event.target)) ||
        (guideRect &&
          event.clientX >= guideRect.left &&
          event.clientX <= guideRect.right &&
          event.clientY >= guideRect.top &&
          event.clientY <= guideRect.bottom)
      ) {
        return;
      }
      const allowed = event.composedPath().some(
        (node) =>
          node instanceof Element &&
          Boolean(
            node.closest("[data-training-guide]") ||
              node.closest('[aria-label="Cookie notice"]') ||
              node.closest(`[data-training-control="${activeControlId}"]`) ||
              node.closest(`[data-training-scope="${activeControlId}"]`) ||
              (step.prepare &&
                node.closest(`[data-training-control="${step.prepare.controlId}"]`)),
          ),
      );
      if (allowed) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setIncorrect(true);
      window.setTimeout(() => setIncorrect(false), 650);
    };
    // Guard completed taps/clicks rather than pointerdown so touch scrolling
    // remains native in mobile Safari.
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [activeControlId, completed, step.prepare, targetMissing]);

  if (!progressReady) {
    return (
      <div data-training-guide className="fixed inset-0 z-[220] grid place-items-center bg-black/85 p-4">
        <section className="w-full max-w-md rounded-2xl border border-[#D8C36A]/45 bg-[#080808] p-6 text-center text-white">
          <h2 className="text-xl font-bold">{progressError ? "TRAINING UNAVAILABLE" : "LOADING TRAINING"}</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {progressError || "Your progress is being prepared."}
          </p>
          {progressError && (
            <a href="/admin?section=academy&academySection=guided-training" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#D8C36A] px-6 text-sm font-bold text-black">
              RETURN TO ACADEMY
            </a>
          )}
        </section>
      </div>
    );
  }

  if (completed) {
    return (
      <div data-training-guide className="fixed inset-0 z-[220] grid place-items-center bg-black/85 p-4">
        <section className="w-full max-w-md rounded-2xl border border-[#D8C36A]/45 bg-[#080808] p-6 text-center text-white">
          <h2 className="text-2xl font-bold">BOOKING COMPLETE</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            You&apos;ve successfully completed this training module.
          </p>
          <a href="/admin?section=academy&academySection=guided-training" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#D8C36A] px-6 text-sm font-bold text-black">
            RETURN TO ACADEMY
          </a>
        </section>
      </div>
    );
  }

  return (
    <>
      {rect && (
        <>
          {[
            { height: Math.max(0, rect.top - 6), left: 0, top: 0, width: "100%" },
            { height: rect.height + 12, left: 0, top: rect.top - 6, width: Math.max(0, rect.left - 6) },
            { height: rect.height + 12, left: rect.right + 6, top: rect.top - 6, width: Math.max(0, window.innerWidth - rect.right - 6) },
            { height: Math.max(0, window.innerHeight - rect.bottom - 6), left: 0, top: rect.bottom + 6, width: "100%" },
          ].map((panel, index) => (
            <div
              key={index}
              aria-hidden="true"
              className={`pointer-events-none fixed z-[204] backdrop-blur-[2px] ${incorrect ? "bg-red-950/60" : "bg-black/65"}`}
              style={panel}
            />
          ))}
          <div
            aria-hidden="true"
            className={`pointer-events-none fixed z-[205] rounded-xl border-2 ${incorrect ? "training-guide-shake border-red-400" : "animate-pulse border-[#F2D66C]"}`}
            style={{
              boxShadow: "0 0 24px rgba(242,214,108,.55)",
              height: rect.height + 12,
              left: Math.max(4, rect.left - 6),
              top: rect.top - 6,
              width: Math.min(
                rect.width + 12,
                window.innerWidth - Math.max(4, rect.left - 6) - 4,
              ),
            }}
          />
        </>
      )}
      <aside
        ref={guideRef}
        data-training-guide
        className={`fixed left-1/2 z-[210] max-h-[min(42dvh,13rem)] w-[min(92vw,34rem)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-2xl border bg-[#080808] p-3 text-white shadow-2xl sm:p-5 ${incorrect ? "border-red-400/70" : "border-[#D8C36A]/45"}`}
        style={{ top: guideTop }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
            STEP {stepIndex + 1} OF {trainingModule.steps.length}
          </p>
          <button
            data-training-guide
            type="button"
            disabled={exiting}
            onClick={() => void exitTraining()}
            className="min-h-9 shrink-0 rounded-full border border-white/15 px-3 text-[0.7rem] font-semibold text-zinc-200 disabled:opacity-50"
          >
            {exiting ? "SAVING" : "EXIT"}
          </button>
        </div>
        <p className={`mt-1.5 text-[0.82rem] font-semibold leading-5 sm:mt-2 sm:text-base ${incorrect ? "text-red-200" : "text-white"}`}>
          {targetMissing
            ? "Follow the highlighted step."
            : incorrect
              ? "Use the highlighted control."
              : activeInstruction}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
          <button data-training-guide type="button" disabled={stepIndex === 0} onClick={moveBack} className="min-h-9 rounded-full border border-white/15 px-3 text-xs font-semibold disabled:opacity-35 sm:min-h-10 sm:px-4">Back</button>
          <button data-training-guide type="button" onClick={restartWorkflow} className="min-h-9 rounded-full border border-white/15 px-3 text-xs font-semibold sm:min-h-10 sm:px-4">Restart</button>
          <button data-training-guide type="button" onClick={() => showCurrentTarget()} className="min-h-9 rounded-full border border-[#D8C36A]/55 px-3 text-xs font-semibold text-[#F2D66C] sm:min-h-10 sm:px-4">Show Me</button>
        </div>
        {progressError && (
          <p role="alert" className="mt-3 text-xs font-semibold text-red-200">
            {progressError}
          </p>
        )}
      </aside>
    </>
  );
}
