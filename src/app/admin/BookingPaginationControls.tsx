import { type FormEvent, useState } from "react";

import {
  maximumPageSize,
  minimumPageSize,
  pageSizeOptions,
  parsePageSize,
  type PaginationWindow,
} from "../../lib/pagination";

type BookingPaginationControlsProps = {
  itemLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSize: number;
  window: PaginationWindow;
};

export default function BookingPaginationControls({
  itemLabel = "bookings",
  onPageChange,
  onPageSizeChange,
  pageSize,
  window,
}: BookingPaginationControlsProps) {
  const isPresetPageSize = pageSizeOptions.some((option) => option === pageSize);
  const [customMode, setCustomMode] = useState(!isPresetPageSize);
  const [customDraft, setCustomDraft] = useState(String(pageSize));
  const [customError, setCustomError] = useState("");

  function applyCustomPageSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPageSize = parsePageSize(customDraft);

    if (!nextPageSize) {
      setCustomError(
        `Enter a whole number from ${minimumPageSize} to ${maximumPageSize}.`,
      );
      return;
    }

    setCustomError("");
    onPageSizeChange(nextPageSize);
  }

  return (
    <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 lg:flex-row lg:items-center lg:justify-between">
      <p className="text-sm text-zinc-400" aria-live="polite">
        Showing{" "}
        <span className="font-semibold text-white">
          {window.start}–{window.end}
        </span>{" "}
        of <span className="font-semibold text-white">{window.total}</span>{" "}
        {itemLabel}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <span>Show</span>
          <select
            aria-label={`Number of ${itemLabel} per page`}
            value={customMode ? "custom" : String(pageSize)}
            onChange={(event) => {
              if (event.target.value === "custom") {
                setCustomMode(true);
                setCustomDraft(String(pageSize));
                setCustomError("");
                return;
              }

              const nextPageSize = Number(event.target.value);
              setCustomMode(false);
              setCustomDraft(String(nextPageSize));
              setCustomError("");
              onPageSizeChange(nextPageSize);
            }}
            className="h-9 rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm font-semibold text-zinc-200 outline-none focus:border-[#D8C36A]/70"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>

        {customMode && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={applyCustomPageSize}
          >
            <input
              aria-label={`Custom number of ${itemLabel} per page`}
              inputMode="numeric"
              min={minimumPageSize}
              max={maximumPageSize}
              step={1}
              type="number"
              value={customDraft}
              onChange={(event) => setCustomDraft(event.target.value)}
              className="h-9 w-20 rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-[#D8C36A]/70"
            />
            <button
              type="submit"
              className="h-9 rounded-lg border border-white/20 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-200 transition hover:bg-white hover:text-black"
            >
              Apply
            </button>
            {customError && (
              <span className="basis-full text-xs text-red-300" role="alert">
                {customError}
              </span>
            )}
          </form>
        )}

        <div className="flex flex-wrap items-center gap-2" aria-label="Pagination">
          <button
            type="button"
            disabled={window.page <= 1}
            onClick={() => onPageChange(1)}
            className="h-9 rounded-lg border border-white/20 px-3 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            First
          </button>
          <button
            type="button"
            disabled={window.page <= 1}
            onClick={() => onPageChange(window.page - 1)}
            className="h-9 rounded-lg border border-white/20 px-3 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            Previous
          </button>
          <span className="min-w-24 text-center text-sm text-zinc-400">
            Page <span className="font-semibold text-white">{window.page}</span>{" "}
            of{" "}
            <span className="font-semibold text-white">{window.pageCount}</span>
          </span>
          <button
            type="button"
            disabled={window.page >= window.pageCount}
            onClick={() => onPageChange(window.page + 1)}
            className="h-9 rounded-lg border border-white/20 px-3 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            Next
          </button>
          <button
            type="button"
            disabled={window.page >= window.pageCount}
            onClick={() => onPageChange(window.pageCount)}
            className="h-9 rounded-lg border border-white/20 px-3 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
