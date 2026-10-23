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
  const [progressReady, setProgressReady] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [exiting, setExiting] = useState(false);
  const guideRef = useRef<HTMLElement | null>(null);
  const completedRecordRef = useRef(false);
  const persistenceRef = useRef<ProgressBootstrap["persistence"] | null>(null);
  const completed = stepIndex >= trainingModule.steps.length;
  const step = trainingModule.steps[Math.min(stepIndex, trainingModule.steps.length - 1)];

  useEffect(() => {
    const controller = new AbortController();
    void fetchSupabaseApi<ProgressBootstrap>(
      `/api/admin/training/guided?module=${encodeURIComponent(moduleId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then((payload) => {
        persistenceRef.current = payload.persistence;
        const saved =
          payload.persistence === "preview-session"
            ? readStoredProgress(moduleId, trainingModule.version)
            : payload.progress.find(
                (row) =>
                  row.module_id === moduleId &&
                  row.module_version === trainingModule.version,
              );
        const savedStep = saved
          ? "current_step" in saved
            ? saved.current_step
            : saved.currentStep
          : 0;
        completedRecordRef.current = saved?.status === "completed";
        setStepIndex(
          saved?.status === "completed"
            ? 0
            : Math.min(savedStep, trainingModule.steps.length - 1),
        );
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
      if (isComplete) completedRecordRef.current = true;
    },
    [moduleId, trainingModule.steps.length, trainingModule.version],
  );

  const persist = useCallback(
    (nextStep: number) => {
      setIncorrect(false);
      setProgressError("");
      setStepIndex(nextStep);
      void saveProgress(nextStep).catch((saveError) => {
        setProgressError(
          saveError instanceof Error
            ? saveError.message
            : "Training progress could not be saved.",
        );
      });
    },
    [saveProgress],
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
    window.requestAnimationFrame(() => {
      // A full remount clears whichever real Production modal or route the
      // trainee reached; client navigation can retain that local workflow state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `/admin?guidedTraining=${encodeURIComponent(moduleId)}`,
      );
    });
  }, [moduleId, persist]);

  const moveBack = useCallback(() => {
    const previousStepIndex = Math.max(0, stepIndex - 1);
    const previousStep = trainingModule.steps[previousStepIndex];
    const previousTarget = document.querySelector<HTMLElement>(
      `[data-training-control="${previousStep.controlId}"]`,
    );
    const previousRect = previousTarget?.getBoundingClientRect();
    const visibleAtCenter = previousRect
      ? document
          .elementFromPoint(
            previousRect.left + previousRect.width / 2,
            previousRect.top + previousRect.height / 2,
          )
          ?.closest(`[data-training-control="${previousStep.controlId}"]`)
      : null;

    if (previousTarget && visibleAtCenter) {
      persist(previousStepIndex);
      previousTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // A prior Production step may be behind a modal or on another route. In
    // that case restart the real workflow instead of leaving the guide and UI
    // out of sync.
    restartWorkflow();
  }, [persist, restartWorkflow, stepIndex, trainingModule.steps]);

  const locate = useCallback(() => {
    if (completed) return;
    const target = findVisibleTrainingElement("control", step.controlId);
    const scope = findVisibleTrainingElement("scope", step.controlId);
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
  }, [completed, step.controlId]);

  const showCurrentTarget = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      setIncorrect(false);
      const target =
        findVisibleTrainingElement("scope", step.controlId) ??
        findVisibleTrainingElement("control", step.controlId);
      if (!target) return false;
      target.scrollIntoView({ behavior, block: "center", inline: "nearest" });
      window.setTimeout(locate, behavior === "smooth" ? 420 : 0);
      return true;
    },
    [locate, step.controlId],
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
          findVisibleTrainingElement("scope", step.controlId) ??
          findVisibleTrainingElement("control", step.controlId);
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
  }, [completed, locate, showCurrentTarget, step.controlId]);

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
      const visibleControl = findVisibleTrainingElement("control", step.controlId);
      const usedTarget = event.composedPath().some(
        (node) =>
          node instanceof Element &&
          Boolean(
            node.closest(`[data-training-control="${step.controlId}"]`) ||
              (!visibleControl &&
                node.closest(`[data-training-scope="${step.controlId}"]`)),
          ),
      );
      if (usedTarget) persist(stepIndex + 1);
    };
    // Let the real Production handler run before recording training progress.
    // Advancing during capture can re-render an open modal before its React
    // onClick handler receives the event, especially in mobile Safari.
    const eventNames = new Set([step.event ?? "click", "keydown"]);
    eventNames.forEach((eventName) => document.addEventListener(eventName, advance));
    return () =>
      eventNames.forEach((eventName) => document.removeEventListener(eventName, advance));
  }, [completed, persist, step.controlId, step.event, step.key, stepIndex]);

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
              node.closest(`[data-training-control="${step.controlId}"]`) ||
              node.closest(`[data-training-scope="${step.controlId}"]`),
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
  }, [completed, step.controlId, targetMissing]);

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
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed z-[205] rounded-xl border-2 ${incorrect ? "border-red-400" : "animate-pulse border-[#F2D66C]"}`}
          style={{
            boxShadow: `0 0 0 9999px ${incorrect ? "rgba(45,0,0,.64)" : "rgba(0,0,0,.7)"}, 0 0 24px rgba(242,214,108,.55)`,
            height: rect.height + 12,
            left: Math.max(4, rect.left - 6),
            top: rect.top - 6,
            width: Math.min(
              rect.width + 12,
              window.innerWidth - Math.max(4, rect.left - 6) - 4,
            ),
          }}
        />
      )}
      <aside
        ref={guideRef}
        data-training-guide
        className="fixed left-1/2 z-[210] max-h-[min(42dvh,13rem)] w-[min(92vw,34rem)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-[#D8C36A]/45 bg-[#080808] p-3 text-white shadow-2xl sm:p-5"
        style={{ top: guideTop }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
            {trainingModule.number} · Step {stepIndex + 1} of {trainingModule.steps.length}
          </p>
          <button
            data-training-guide
            type="button"
            disabled={exiting}
            onClick={() => void exitTraining()}
            className="min-h-9 shrink-0 rounded-full border border-white/15 px-3 text-[0.7rem] font-semibold text-zinc-200 disabled:opacity-50"
          >
            {exiting ? "SAVING" : "EXIT TRAINING"}
          </button>
        </div>
        <p className={`mt-1.5 text-[0.82rem] font-semibold leading-5 sm:mt-2 sm:text-base ${incorrect ? "text-red-200" : "text-white"}`}>
          {targetMissing
            ? "Follow the highlighted step."
            : incorrect
              ? "Use the highlighted control."
              : step.instruction}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
          <button data-training-guide type="button" disabled={stepIndex === 0} onClick={moveBack} className="min-h-9 rounded-full border border-white/15 px-3 text-xs font-semibold disabled:opacity-35 sm:min-h-10 sm:px-4">Back</button>
          <button data-training-guide type="button" onClick={restartWorkflow} className="min-h-9 rounded-full border border-white/15 px-3 text-xs font-semibold sm:min-h-10 sm:px-4">Restart</button>
          <button data-training-guide type="button" disabled={targetMissing} onClick={() => showCurrentTarget()} className="min-h-9 rounded-full border border-[#D8C36A]/55 px-3 text-xs font-semibold text-[#F2D66C] disabled:opacity-35 sm:min-h-10 sm:px-4">Show Me</button>
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
