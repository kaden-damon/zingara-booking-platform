"use client";

import { useState } from "react";

export type CustomerIdentityDraft = {
  email: string;
  firstName: string;
  lastName: string;
  mobile: string;
};

export function CustomerIdentityEditor({
  error,
  initialValue,
  isSaving,
  onCancel,
  onSave,
}: {
  error: string;
  initialValue: CustomerIdentityDraft;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (draft: CustomerIdentityDraft) => void;
}) {
  const [draft, setDraft] = useState(initialValue);

  function updateDraft(field: keyof CustomerIdentityDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="rounded-2xl border border-[#D8C36A]/25 bg-[#D8C36A]/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F2D66C]">
            Edit Customer Details
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Updates the linked customer profile used by Admin booking views.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-zinc-200 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {(
          [
            ["firstName", "First Name", "text", ""],
            ["lastName", "Last Name", "text", ""],
            ["email", "Email", "email", "email"],
            ["mobile", "Mobile", "tel", "tel"],
          ] as const
        ).map(([field, label, type, autoComplete]) => (
          <label key={field}>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {label}
            </span>
            <input
              autoComplete={autoComplete}
              type={type}
              value={draft[field]}
              onChange={(event) => updateDraft(field, event.target.value)}
              disabled={isSaving}
              className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      {error && (
        <p className="mt-3 text-sm font-semibold text-red-200" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => onSave(draft)}
        disabled={isSaving}
        className="mt-4 rounded-full border border-emerald-300/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-100 transition hover:bg-emerald-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
