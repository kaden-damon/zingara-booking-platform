"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import {
  adminOperationErrorEvent,
  type AdminIssueTechnicalContext,
} from "@/lib/adminIssueCapture";

const QuickIssueReporterPanel = dynamic(
  () => import("./QuickIssueReporterPanel"),
  { ssr: false },
);

type Position = { left: number; top: number };

const buttonSize = 48;
const viewportMargin = 12;

function clampPosition(position: Position) {
  return {
    left: Math.min(
      Math.max(viewportMargin, position.left),
      Math.max(viewportMargin, window.innerWidth - buttonSize - viewportMargin),
    ),
    top: Math.min(
      Math.max(viewportMargin, position.top),
      Math.max(viewportMargin, window.innerHeight - buttonSize - viewportMargin),
    ),
  };
}

export function QuickIssueReporter({ staffId }: { staffId: string }) {
  const storageKey = `zingara-quick-issue-position:${staffId}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    moved: boolean;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const bounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [context, setContext] = useState<AdminIssueTechnicalContext | null>(null);
  const [isBouncing, setIsBouncing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored ? clampPosition(JSON.parse(stored) as Position) : null;
    } catch {
      window.localStorage.removeItem(storageKey);
      return null;
    }
  });

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => (current ? clampPosition(current) : current));
    };
    const handleOperationError = (event: Event) => {
      const nextContext = (event as CustomEvent<AdminIssueTechnicalContext>).detail;
      if (!nextContext) return;
      setContext(nextContext);
      setIsBouncing(true);
      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
      bounceTimerRef.current = setTimeout(() => setIsBouncing(false), 1400);
    };

    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener(adminOperationErrorEvent, handleOperationError);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener(adminOperationErrorEvent, handleOperationError);
      if (bounceTimerRef.current) clearTimeout(bounceTimerRef.current);
    };
  }, [storageKey]);

  function persistPosition(next: Position) {
    setPosition(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  return (
    <>
      <button
        ref={buttonRef}
        aria-label="Report an issue"
        className={`quick-issue-button fixed z-[220] flex h-12 w-12 touch-none select-none items-center justify-center rounded-full border border-[#F2D66C]/65 bg-[#17120A] text-xl font-black text-[#F2D66C] shadow-[0_0_18px_rgba(216,195,106,0.5)] transition hover:bg-[#D8C36A] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F2D66C] ${isBouncing ? "quick-issue-bounce" : ""}`}
        onClick={() => {
          if (dragRef.current?.moved) {
            dragRef.current = null;
            return;
          }
          setIsOpen(true);
        }}
        onPointerDown={(event) => {
          const rect = buttonRef.current?.getBoundingClientRect();
          if (!rect) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            moved: false,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const next = clampPosition({
            left: event.clientX - drag.offsetX,
            top: event.clientY - drag.offsetY,
          });
          if (
            Math.abs(next.left - (position?.left ?? event.clientX)) > 3 ||
            Math.abs(next.top - (position?.top ?? event.clientY)) > 3
          ) {
            drag.moved = true;
          }
          setPosition(next);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          if (position) persistPosition(clampPosition(position));
        }}
        style={
          position
            ? { left: position.left, top: position.top }
            : { bottom: 20, right: 20 }
        }
        suppressHydrationWarning
        title="Report issue"
        type="button"
      >
        !
      </button>

      {isOpen && (
        <QuickIssueReporterPanel
          context={context}
          onClose={() => setIsOpen(false)}
        />
      )}

      <style jsx>{`
        @keyframes quick-issue-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          25% { transform: translateY(-9px) scale(1.06); }
          50% { transform: translateY(0) scale(1); }
          75% { transform: translateY(-5px) scale(1.03); }
        }
        .quick-issue-bounce { animation: quick-issue-bounce 700ms ease-out 2; }
        @media (prefers-reduced-motion: reduce) {
          .quick-issue-button { transition: none; }
          .quick-issue-bounce { animation: none; }
        }
      `}</style>
    </>
  );
}
