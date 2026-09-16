"use client";

import { useEffect, useMemo } from "react";

import {
  formatStaffIssueFileSize,
  getStaffIssueMediaKind,
  isStaffIssueMediaType,
  staffIssueMediaMaxFileSize,
  staffIssueMediaMaxFiles,
  staffIssueMediaMaxTotalSize,
} from "@/lib/staffIssueMedia";
import type { StaffIssueSelectedFile } from "@/lib/staffIssueMediaClient";

function SelectedMediaPreview({ selected }: { selected: StaffIssueSelectedFile }) {
  const previewUrl = useMemo(
    () => URL.createObjectURL(selected.file),
    [selected.file],
  );

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  if (!isStaffIssueMediaType(selected.file.type)) {
    return null;
  }

  return getStaffIssueMediaKind(selected.file.type) === "image" ? (
    // Local object URLs are temporary previews and do not benefit from optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className="h-12 w-12 shrink-0 object-cover"
      src={previewUrl}
    />
  ) : (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-zinc-900 text-[0.6rem] font-bold text-[#D8C36A]">
      VIDEO
    </div>
  );
}

export function validateSelectedStaffIssueFiles(files: File[]) {
  if (files.length > staffIssueMediaMaxFiles) {
    return `Attach no more than ${staffIssueMediaMaxFiles} files to one issue.`;
  }

  if (files.some((file) => !isStaffIssueMediaType(file.type))) {
    return "Use JPEG, PNG, WEBP, MP4, or MOV files only.";
  }

  if (files.some((file) => file.size > staffIssueMediaMaxFileSize)) {
    return "Each attachment must be 25 MB or smaller.";
  }

  if (files.reduce((sum, file) => sum + file.size, 0) > staffIssueMediaMaxTotalSize) {
    return "The selected attachments exceed the 50 MB total limit.";
  }

  return null;
}

export function StaffIssueMediaPicker({
  disabled,
  error,
  files,
  onChange,
  onError,
}: {
  disabled: boolean;
  error: string;
  files: StaffIssueSelectedFile[];
  onChange: (files: StaffIssueSelectedFile[]) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="border border-white/10 bg-black/45 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Media / Attachments
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Optional. Add up to five JPEG, PNG, WEBP, MP4, or MOV files.
          </p>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center border border-[#D8C36A]/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black">
          Add Media
          <input
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mov"
            className="sr-only"
            disabled={disabled}
            multiple
            onChange={(event) => {
              const selectedFiles = Array.from(event.target.files ?? []);
              const nextFiles = [
                ...files,
                ...selectedFiles.map((file) => ({
                  clientId: crypto.randomUUID(),
                  file,
                })),
              ];
              const validationError = validateSelectedStaffIssueFiles(
                nextFiles.map((selected) => selected.file),
              );

              event.target.value = "";

              if (validationError) {
                onError(validationError);
                return;
              }

              onError("");
              onChange(nextFiles);
            }}
            type="file"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-xs text-red-200">{error}</p>}

      {files.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {files.map((selected) => (
            <div
              className="flex min-w-0 items-center gap-3 border border-white/10 bg-zinc-950 p-2"
              key={selected.clientId}
            >
              <SelectedMediaPreview selected={selected} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">
                  {selected.file.name}
                </p>
                <p className="mt-1 text-[0.65rem] text-zinc-500">
                  {formatStaffIssueFileSize(selected.file.size)}
                </p>
              </div>
              <button
                aria-label={`Remove ${selected.file.name}`}
                className="h-9 w-9 shrink-0 text-sm text-zinc-400 hover:text-white"
                disabled={disabled}
                onClick={() => {
                  onError("");
                  onChange(
                    files.filter(
                      (candidate) => candidate.clientId !== selected.clientId,
                    ),
                  );
                }}
                type="button"
              >
                X
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
