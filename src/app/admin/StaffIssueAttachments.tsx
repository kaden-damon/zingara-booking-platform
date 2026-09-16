"use client";

import { useEffect, useState } from "react";

import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import {
  formatStaffIssueFileSize,
  type StaffIssueAttachment,
} from "@/lib/staffIssueMedia";

export function StaffIssueAttachments({
  attachments,
  issueId,
}: {
  attachments: StaffIssueAttachment[];
  issueId: string;
}) {
  const [access, setAccess] = useState<{
    error: string;
    issueId: string;
    urls: Record<string, string>;
  }>({ error: "", issueId: "", urls: {} });

  useEffect(() => {
    let active = true;

    if (attachments.length === 0) {
      return () => {
        active = false;
      };
    }

    void fetchSupabaseApi<{
      attachments: Array<{ id: string; url: string | null }>;
    }>(`/api/admin/issues/attachments/access?issueId=${encodeURIComponent(issueId)}`)
      .then((payload) => {
        if (!active) return;
        setAccess({
          error: "",
          issueId,
          urls: Object.fromEntries(
            payload.attachments
              .filter((attachment) => Boolean(attachment.url))
              .map((attachment) => [attachment.id, attachment.url as string]),
          ),
        });
      })
      .catch(() => {
        if (active) {
          setAccess({
            error: "Attachments could not be opened securely.",
            issueId,
            urls: {},
          });
        }
      });

    return () => {
      active = false;
    };
  }, [attachments, issueId]);

  if (attachments.length === 0) {
    return null;
  }

  const urls = access.issueId === issueId ? access.urls : {};
  const error = access.issueId === issueId ? access.error : "";

  return (
    <section className="border border-white/10 bg-zinc-950 p-4">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        Attachments
      </p>
      {error && <p className="mt-2 text-xs text-red-200">{error}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {attachments.map((attachment) => {
          const url = urls[attachment.id];

          return (
            <article
              className="min-w-0 border border-white/10 bg-black/50 p-3"
              key={attachment.id}
            >
              {url && attachment.mediaKind === "image" ? (
                // Private short-lived signed URLs cannot use the image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={attachment.originalFilename}
                  className="aspect-video w-full object-contain"
                  loading="lazy"
                  src={url}
                />
              ) : url ? (
                <video
                  className="aspect-video w-full bg-black object-contain"
                  controls
                  preload="metadata"
                  src={url}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-black text-xs font-semibold text-zinc-500">
                  {attachment.mediaKind === "image" ? "IMAGE" : "VIDEO"}
                </div>
              )}
              <p className="mt-3 truncate text-sm font-semibold text-white">
                {attachment.originalFilename}
              </p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-500">
                  {formatStaffIssueFileSize(attachment.fileSize)}
                </span>
                {url && (
                  <a
                    className="text-xs font-semibold uppercase tracking-[0.1em] text-[#F2D66C] hover:text-white"
                    href={url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
