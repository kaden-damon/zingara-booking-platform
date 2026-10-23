"use client";

import { useEffect, useState } from "react";

import {
  guidedTrainingModules,
  type GuidedTrainingModuleId,
  type GuidedTrainingStatus,
} from "@/lib/guidedTraining";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

export type GuidedTrainingBootstrap = {
  persistence: "academy" | "preview-session";
  progress: Array<{
    completed_at?: string | null;
    current_step: number;
    module_id: GuidedTrainingModuleId;
    module_version: number;
    status: Exclude<GuidedTrainingStatus, "not-started">;
  }>;
  staffId: string;
};

function progressKey(staffId: string) {
  return `zingara-guided-training:${staffId}`;
}

function readPreviewProgress(staffId: string) {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(progressKey(staffId)) ?? "[]",
    ) as Array<{
      completedAt?: string;
      currentStep: number;
      moduleId: GuidedTrainingModuleId;
      moduleVersion: number;
      status: GuidedTrainingStatus;
    }>;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function GuidedTraining({
  initialBootstrap,
  previewKey = "",
}: {
  initialBootstrap?: GuidedTrainingBootstrap;
  previewKey?: string;
}) {
  const [bootstrap, setBootstrap] = useState<GuidedTrainingBootstrap | null>(
    initialBootstrap ?? null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialBootstrap?.persistence !== "preview-session") return;
    const frame = window.requestAnimationFrame(() => {
      const saved = readPreviewProgress(initialBootstrap.staffId);
      if (saved.length === 0) return;
      setBootstrap({
        ...initialBootstrap,
        progress: saved.map((item) => ({
          completed_at: item.completedAt ?? null,
          current_step: item.currentStep,
          module_id: item.moduleId,
          module_version: item.moduleVersion,
          status: item.status === "not-started" ? "in-progress" : item.status,
        })),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialBootstrap]);

  useEffect(() => {
    if (initialBootstrap) return;
    const controller = new AbortController();
    void fetchSupabaseApi<GuidedTrainingBootstrap>(
      "/api/admin/training/guided",
      { cache: "no-store", signal: controller.signal },
    )
      .then((payload) => {
        setBootstrap(payload);
      })
      .catch((loadError) => {
        if (
          !(loadError instanceof DOMException && loadError.name === "AbortError")
        ) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Guided Training could not be loaded.",
          );
        }
      });
    return () => controller.abort();
  }, [initialBootstrap]);

  if (error && !bootstrap) {
    return (
      <p
        role="alert"
        className="rounded-2xl border border-red-400/30 bg-red-950/25 p-4 text-red-100"
      >
        {error}
      </p>
    );
  }
  if (!bootstrap) {
    return (
      <p className="rounded-2xl border border-white/10 bg-black/35 p-5 text-zinc-400">
        Loading Guided Training...
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#D8C36A]/25 bg-black/35 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
          Zingara Academy
        </p>
        <h3 className="mt-2 text-2xl font-bold text-white">Guided Training</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Choose a module and follow the highlighted steps.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {guidedTrainingModules.map((module) => {
          const saved = bootstrap.progress.find(
            (item) =>
              item.module_id === module.id &&
              item.module_version === module.version,
          );
          const status = saved?.status ?? "not-started";
          const startHref = previewKey
            ? `/api/admin/training/guided/start?key=${encodeURIComponent(previewKey)}&module=${encodeURIComponent(module.id)}`
            : `/admin?guidedTraining=${encodeURIComponent(module.id)}`;
          return (
            <article
              key={module.id}
              className="rounded-2xl border border-white/10 bg-black/45 p-5"
            >
              <p className="text-xs font-bold text-[#D8C36A]">{module.number}</p>
              <h4 className="mt-2 text-lg font-bold text-white">
                {module.title}
              </h4>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                {status.replaceAll("-", " ")}
              </p>
              {saved?.completed_at && (
                <p className="mt-1 text-xs text-zinc-500">
                  Completed{" "}
                  {new Date(saved.completed_at).toLocaleString("en-ZA")}
                </p>
              )}
              <a
                href={startHref}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#D8C36A] px-4 text-sm font-bold text-black transition hover:bg-[#F2D66C]"
              >
                {status === "completed"
                  ? "Completed - Review"
                  : status === "in-progress"
                    ? "Continue"
                    : "Start"}
              </a>
            </article>
          );
        })}
      </div>
    </div>
  );
}
