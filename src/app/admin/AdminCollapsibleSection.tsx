"use client";

import {
  type ReactNode,
  useId,
  useState,
} from "react";

type AdminCollapsibleSectionProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  summary?: ReactNode;
  title: string;
};

export function AdminCollapsibleSection({
  children,
  className = "",
  contentClassName = "p-4 sm:p-5",
  defaultOpen = false,
  onOpenChange,
  open,
  summary,
  title,
}: AdminCollapsibleSectionProps) {
  const generatedId = useId();
  const contentId = `admin-collapsible-${generatedId.replaceAll(":", "")}`;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  function toggle() {
    const nextOpen = !isOpen;

    if (open === undefined) {
      setInternalOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  }

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-white/10 bg-black/30 ${className}`}
    >
      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={isOpen}
        onClick={toggle}
        className="flex min-h-12 w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#D8C36A] sm:px-5"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
            {title}
          </span>
          {summary && (
            <span className="mt-1 block text-xs leading-5 text-zinc-500">
              {summary}
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-xl leading-none text-[#F2D66C] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          ⌄
        </span>
      </button>
      <div
        id={contentId}
        aria-hidden={!isOpen}
        inert={isOpen ? undefined : true}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isOpen
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`border-t border-white/10 ${contentClassName}`}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
