"use client";

export default function AdminOnOffSwitch({
  checked,
  disabled,
  label,
  loading = false,
  onChange,
  size = "compact",
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onChange: (enabled: boolean) => void;
  size?: "compact" | "large";
}) {
  const large = size === "large";

  return (
    <button
      type="button"
      role="switch"
      aria-busy={loading}
      aria-checked={checked}
      aria-label={`${label} is ${loading ? "loading" : checked ? "ON" : "OFF"}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full border-2 text-white shadow-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C] focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
        large ? "h-12 w-28 p-1" : "h-8 w-[4.5rem] p-0.5"
      } ${
        loading
          ? "border-zinc-700 bg-zinc-800"
          : checked
          ? "border-emerald-300 bg-emerald-600"
          : "border-zinc-400 bg-zinc-600"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        aria-hidden="true"
        className={`absolute rounded-full bg-white shadow-md transition-transform duration-200 ${
          large
            ? `left-1 top-1 h-9 w-9 ${checked ? "translate-x-16" : "translate-x-0"}`
            : `left-0.5 top-0.5 h-6 w-6 ${checked ? "translate-x-10" : "translate-x-0"}`
        }`}
      />
      <span
        className={`absolute inset-0 flex items-center font-extrabold tracking-[0.08em] ${
          large ? "text-xs" : "text-[0.58rem]"
        } ${
          checked
            ? large
              ? "justify-start pl-4"
              : "justify-start pl-2"
            : large
              ? "justify-end pr-4"
              : "justify-end pr-1.5"
        }`}
      >
        {loading ? "..." : checked ? "ON" : "OFF"}
      </span>
    </button>
  );
}
