import type { StaffActionGuidance } from "@/lib/staffActionGuidance";

const statusClasses: Record<StaffActionGuidance["status"], string> = {
  blocked: "border-amber-300/45 bg-amber-950 text-amber-50",
  error: "border-red-300/45 bg-red-950 text-red-50",
  success: "border-emerald-300/45 bg-emerald-950 text-emerald-50",
  warning: "border-amber-200/45 bg-zinc-950 text-amber-50",
};

export function StaffActionGuidanceAlert({
  guidance,
  onAction,
  onDismiss,
}: {
  guidance: StaffActionGuidance;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-live={guidance.status === "error" ? "assertive" : "polite"}
      className={`fixed bottom-4 right-4 z-[170] w-[calc(100vw-2rem)] max-w-md border p-4 shadow-2xl sm:bottom-6 sm:right-6 ${statusClasses[guidance.status]}`}
      role={guidance.status === "error" ? "alert" : "status"}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold">{guidance.title}</p>
          <p className="mt-1 text-sm leading-6 opacity-90">{guidance.message}</p>
          {guidance.nextStep && (
            <p className="mt-2 text-sm leading-6 opacity-80">{guidance.nextStep}</p>
          )}
        </div>
        <button
          aria-label="Dismiss guidance"
          className="h-9 w-9 shrink-0 text-xl leading-none opacity-75 transition hover:opacity-100"
          onClick={onDismiss}
          type="button"
        >
          X
        </button>
      </div>
      {guidance.action && onAction && (
        <button
          className="mt-3 min-h-11 border border-current px-4 py-2 text-sm font-bold transition hover:bg-white hover:text-black"
          onClick={onAction}
          type="button"
        >
          {guidance.action.label}
        </button>
      )}
    </section>
  );
}
