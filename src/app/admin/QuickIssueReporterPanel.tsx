"use client";

import { useEffect, useRef, useState } from "react";

import { validateSelectedStaffIssueFiles } from "./StaffIssueMediaPicker";
import {
  buildQuickIssueDescription,
  type AdminIssueTechnicalContext,
} from "@/lib/adminIssueCapture";
import type {
  StaffIssueAttachmentUpload,
  StaffIssueMediaType,
} from "@/lib/staffIssueMedia";
import {
  type StaffIssueSelectedFile,
  uploadAndFinalizeStaffIssueMedia,
} from "@/lib/staffIssueMediaClient";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import type { StaffIssueReport } from "@/lib/staffIssues";

function createClientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `issue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDeviceLabel() {
  if (window.matchMedia("(pointer: coarse)").matches) {
    return window.innerWidth < 768 ? "Mobile" : "Tablet";
  }
  return "Desktop";
}

function getSastTimestamp() {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date());
}

async function captureScreen(panel: HTMLElement | null): Promise<File> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture is unavailable here. Use Attach instead.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: true,
  });
  const track = stream.getVideoTracks()[0];

  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) resolve();
      else video.addEventListener("loadeddata", () => resolve(), { once: true });
    });
    if (panel) panel.style.visibility = "hidden";
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("The screenshot could not be prepared.");
    return new File([blob], `zingara-issue-${Date.now()}.png`, {
      type: "image/png",
    });
  } finally {
    if (panel) panel.style.visibility = "";
    track?.stop();
    stream.getTracks().forEach((item) => item.stop());
  }
}

export default function QuickIssueReporterPanel({
  context,
  onClose,
}: {
  context: AdminIssueTechnicalContext | null;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const submissionIdRef = useRef(createClientId());
  const [description, setDescription] = useState(() =>
    buildQuickIssueDescription(context),
  );
  const [error, setError] = useState("");
  const [files, setFiles] = useState<StaffIssueSelectedFile[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isSubmitting, onClose]);

  function addFiles(selected: File[]) {
    const next = [
      ...files,
      ...selected.map((file) => ({ clientId: createClientId(), file })),
    ];
    const validationError = validateSelectedStaffIssueFiles(
      next.map((item) => item.file),
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setFiles(next);
  }

  async function submit() {
    if (!description.trim() || isSubmitting) {
      if (!description.trim()) setError("Add a short description before sending.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const technicalContext: AdminIssueTechnicalContext = {
        ...context,
        adminPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        browser: navigator.userAgent,
        device: getDeviceLabel(),
        timestampSast: getSastTimestamp(),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      };
      const payload = await fetchSupabaseApi<{
        attachmentFailures: Array<{ filename: string; reason: string }>;
        attachmentUploads: StaffIssueAttachmentUpload[];
        issue: StaffIssueReport;
        notificationDelivered: boolean | null;
        notificationError: string | null;
      }>("/api/admin/issues", {
        body: {
          attachments: files.map((selected) => ({
            clientId: selected.clientId,
            fileSize: selected.file.size,
            mimeType: selected.file.type as StaffIssueMediaType,
            originalFilename: selected.file.name,
          })),
          category: "system_technical",
          currentPath: technicalContext.adminPath,
          description: description.trim(),
          location: context?.venue ?? "",
          moduleOrArea: context?.module ?? "Admin",
          priority: (context?.status ?? 0) >= 500 ? "high" : "normal",
          quickReporter: true,
          submissionId: submissionIdRef.current,
          technicalContext,
          title: context?.errorCode
            ? `Admin error · ${context.errorCode}`
            : `Quick issue · ${context?.module ?? "Admin"}`,
        },
        method: "POST",
      });

      let failures = payload.attachmentFailures;
      if (payload.attachmentUploads.length) {
        const finalized = await uploadAndFinalizeStaffIssueMedia({
          files,
          issueId: payload.issue.id,
          uploads: payload.attachmentUploads,
        });
        failures = [...failures, ...finalized.failures];
      }

      setFiles([]);
      setSuccess(
        failures.length
          ? `${payload.issue.ticketReference} sent. Some attachments did not upload.`
          : `${payload.issue.ticketReference} sent.`,
      );
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The issue could not be sent. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      ref={panelRef}
      aria-label="Report issue"
      className="fixed inset-x-3 bottom-3 z-[230] max-h-[min(78dvh,560px)] overflow-y-auto rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 p-4 text-white shadow-2xl shadow-black/70 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[420px] sm:p-5"
      role="dialog"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase text-[#F2D66C]">
          Report Issue
        </h2>
        <button
          aria-label="Close issue reporter"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          disabled={isSubmitting}
          onClick={onClose}
          type="button"
        >
          X
        </button>
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Issue description</span>
        <textarea
          autoFocus
          className="min-h-28 w-full resize-y rounded-xl border border-white/15 bg-black/60 px-3 py-3 text-sm leading-5 text-white outline-none transition focus:border-[#D8C36A] focus:ring-1 focus:ring-[#D8C36A]/35"
          disabled={isSubmitting}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </label>

      {files.length > 0 && (
        <div className="mt-3 grid gap-2">
          {files.map((selected) => (
            <div
              className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs"
              key={selected.clientId}
            >
              <span className="min-w-0 flex-1 truncate">{selected.file.name}</span>
              <button
                aria-label={`Remove ${selected.file.name}`}
                className="h-8 w-8 shrink-0 rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
                disabled={isSubmitting}
                onClick={() =>
                  setFiles((current) =>
                    current.filter((item) => item.clientId !== selected.clientId),
                  )
                }
                type="button"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-300/25 bg-red-950/30 px-3 py-2 text-xs text-red-100">
          {error}
        </p>
      )}
      {success && (
        <p
          className="mt-3 rounded-xl border border-emerald-300/25 bg-emerald-950/25 px-3 py-2 text-xs text-emerald-100"
          role="status"
        >
          {success}
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          className="min-h-11 rounded-full border border-[#D8C36A]/40 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#F2D66C] transition hover:border-[#F2D66C] hover:bg-[#D8C36A]/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isCapturing || isSubmitting}
          onClick={() => {
            setIsCapturing(true);
            setError("");
            void captureScreen(panelRef.current)
              .then((file) => addFiles([file]))
              .catch((captureError) =>
                setError(
                  captureError instanceof Error
                    ? captureError.message
                    : "The screen could not be captured.",
                ),
              )
              .finally(() => setIsCapturing(false));
          }}
          type="button"
        >
          {isCapturing ? "Capturing..." : "Capture"}
        </button>
        <button
          className="min-h-11 rounded-full border border-[#D8C36A]/40 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#F2D66C] transition hover:border-[#F2D66C] hover:bg-[#D8C36A]/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSubmitting}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          Attach
        </button>
        <button
          className="min-h-11 rounded-full bg-[#D8C36A] px-3 text-xs font-bold uppercase tracking-[0.08em] text-black transition hover:bg-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSubmitting}
          onClick={() => void submit()}
          type="button"
        >
          {isSubmitting ? "Sending..." : "Send"}
        </button>
      </div>
      <input
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mov"
        className="sr-only"
        disabled={isSubmitting}
        multiple
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
        type="file"
      />
    </section>
  );
}
