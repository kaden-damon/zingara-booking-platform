"use client";

import { useEffect, useRef, useState } from "react";

import { fetchSupabaseApi } from "@/lib/supabase/apiClient";
import type {
  XeroDocumentLineInput,
  XeroLineAmountType,
} from "@/lib/xero/documentMath";

type BookingDocumentSummary = {
  created_at: string;
  document_date: string;
  id: string;
  kind: "invoice" | "quote";
  local_reference: string;
  source_booking_reference: string | null;
  status: string;
  sync_status: string;
  total_cents: number;
  updated_at: string;
  venue: string;
  version: number;
  xero_document_number: string | null;
  xero_status: string | null;
};

type BookingDocumentDetail = BookingDocumentSummary & {
  account_number: string | null;
  billing_address: string | null;
  customer_email: string | null;
  customer_name: string;
  customer_notes: string | null;
  guest_count: number | null;
  line_amount_type: XeroLineAmountType;
  lines: Array<
    XeroDocumentLineInput & {
      subtotalCents: number;
      taxCents: number;
      totalCents: number;
    }
  >;
  payment_terms: string | null;
  performance_date: string | null;
  performance_time: string | null;
  seating_summary: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  valid_until: string | null;
};

type DocumentDetailResponse = { document: BookingDocumentDetail };
type DocumentListResponse = {
  canCreateBookingInvoice: boolean;
  documents: BookingDocumentSummary[];
};

const actionClass =
  "inline-flex min-h-10 items-center justify-center rounded-full border border-[#D8C36A]/40 px-4 py-2 text-xs font-semibold text-[#F2D66C] transition hover:border-[#F2D66C] hover:bg-[#D8C36A] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] disabled:cursor-wait disabled:opacity-50";

function money(cents: number) {
  return new Intl.NumberFormat("en-ZA", {
    currency: "ZAR",
    style: "currency",
  }).format(cents / 100);
}

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function bookingDocumentTypeLabel(document: BookingDocumentSummary) {
  if (document.kind === "quote") return "Quotation";
  if (
    document.xero_document_number ||
    ["authorised", "issued", "paid"].includes(
      document.xero_status?.toLowerCase() ?? "",
    )
  ) {
    return "Issued Invoice";
  }
  return "Invoice Draft";
}

export default function BookingDocumentsSection({
  bookingReference,
}: {
  bookingReference: string;
}) {
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<BookingDocumentSummary[] | null>(
    null,
  );
  const [canCreateBookingInvoice, setCanCreateBookingInvoice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{
    reference: string;
    url: string;
  } | null>(null);
  const pdfCache = useRef(new Map<string, { blob: Blob; url: string }>());

  useEffect(() => {
    const cache = pdfCache.current;
    return () => {
      for (const cached of cache.values()) URL.revokeObjectURL(cached.url);
      cache.clear();
    };
  }, []);

  async function loadDocuments() {
    setLoading(true);
    setError("");
    try {
      const result = await fetchSupabaseApi<DocumentListResponse>(
        `/api/admin/xero?bookingDocumentsReference=${encodeURIComponent(bookingReference)}`,
        { cache: "no-store" },
      );
      setCanCreateBookingInvoice(result.canCreateBookingInvoice);
      setDocuments(result.documents);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The documents could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && documents === null && !loading) void loadDocuments();
  }

  async function getPdf(document: BookingDocumentSummary) {
    const cached = pdfCache.current.get(document.id);
    if (cached) return cached;

    const result = await fetchSupabaseApi<DocumentDetailResponse>(
      `/api/admin/xero?documentId=${encodeURIComponent(document.id)}`,
      { cache: "no-store" },
    );
    const detail = result.document;
    const { createXeroDocumentPdf } = await import("@/lib/xero/documentPdf");
    const bytes = createXeroDocumentPdf({
      accountNumber: detail.account_number,
      billingAddress: detail.billing_address,
      customerEmail: detail.customer_email,
      customerName: detail.customer_name,
      customerNotes: detail.customer_notes,
      documentDate: detail.document_date,
      guestCount: detail.guest_count,
      kind: detail.kind,
      lineAmountType: detail.line_amount_type,
      lines: detail.lines,
      localReference: detail.local_reference,
      paymentTerms: detail.payment_terms,
      performanceDate: detail.performance_date,
      performanceTime: detail.performance_time,
      seatingSummary: detail.seating_summary,
      sourceBookingReference: detail.source_booking_reference,
      status: detail.status,
      subtotalCents: detail.subtotal_cents,
      taxCents: detail.tax_cents,
      totalCents: detail.total_cents,
      validUntil: detail.valid_until,
      venue: detail.venue,
      xeroDocumentNumber: detail.xero_document_number,
    });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const generated = { blob, url: URL.createObjectURL(blob) };
    pdfCache.current.set(document.id, generated);
    return generated;
  }

  async function viewPdf(document: BookingDocumentSummary) {
    setBusyDocumentId(document.id);
    setError("");
    try {
      const pdf = await getPdf(document);
      setViewer({ reference: document.local_reference, url: pdf.url });
    } catch (pdfError) {
      setError(
        pdfError instanceof Error
          ? pdfError.message
          : "The PDF could not be opened.",
      );
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function downloadPdf(document: BookingDocumentSummary) {
    setBusyDocumentId(document.id);
    setError("");
    try {
      const pdf = await getPdf(document);
      const anchor = window.document.createElement("a");
      anchor.href = pdf.url;
      anchor.download = `${document.local_reference}.pdf`;
      anchor.click();
    } catch (pdfError) {
      setError(
        pdfError instanceof Error
          ? pdfError.message
          : "The PDF could not be downloaded.",
      );
    } finally {
      setBusyDocumentId(null);
    }
  }

  return (
    <section
      className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4"
      aria-labelledby={`booking-documents-${bookingReference}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[#D8C36A]">
            Financial Documents
          </p>
          <h4
            id={`booking-documents-${bookingReference}`}
            className="mt-1 text-sm font-semibold text-white"
          >
            Quotes &amp; Invoices
          </h4>
        </div>
        <button type="button" onClick={toggleOpen} className={actionClass}>
          {open ? "Hide" : "Open"}
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-white/10 pt-4">
          {canCreateBookingInvoice && !loading && !error && (
            <div className="mb-4 flex justify-end">
              <a
                href={`/admin?section=xero&booking=${encodeURIComponent(bookingReference)}&document=invoice`}
                className={actionClass}
              >
                Create Invoice Draft
              </a>
            </div>
          )}
          {loading ? (
            <p role="status" className="text-sm text-zinc-400">
              Loading documents...
            </p>
          ) : error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-rose-200">{error}</p>
              <button type="button" onClick={() => void loadDocuments()} className={actionClass}>
                Retry
              </button>
            </div>
          ) : documents?.length ? (
            <div className="space-y-3">
              {documents.map((document) => (
                <article
                  key={document.id}
                  className="flex flex-col gap-3 border-b border-white/10 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">
                        {document.xero_document_number ?? document.local_reference}
                      </p>
                      <span className="rounded-full border border-[#D8C36A]/30 bg-[#D8C36A]/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[#F2D66C]">
                        {bookingDocumentTypeLabel(document)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">
                      {statusLabel(document.xero_status ?? document.status)} · {money(document.total_cents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyDocumentId === document.id}
                      onClick={() => void viewPdf(document)}
                      className={actionClass}
                    >
                      View PDF
                    </button>
                    <button
                      type="button"
                      disabled={busyDocumentId === document.id}
                      onClick={() => void downloadPdf(document)}
                      className={actionClass}
                    >
                      Download PDF
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-zinc-400">
                No quotations or invoices are linked to this booking.
              </p>
              {canCreateBookingInvoice && (
                <p className="text-xs text-zinc-500">
                  Create a reviewed invoice draft from the authoritative booking value.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/85 p-3 sm:p-5">
          <button
            type="button"
            aria-label="Close PDF viewer"
            onClick={() => setViewer(null)}
            className="absolute inset-0"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-document-viewer-title"
            className="relative z-10 flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#D8C36A]/35 bg-zinc-950 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3 sm:p-4">
              <h3 id="booking-document-viewer-title" className="truncate font-semibold text-white">
                {viewer.reference}
              </h3>
              <button type="button" onClick={() => setViewer(null)} className={actionClass}>
                Close
              </button>
            </div>
            <iframe
              src={viewer.url}
              title={`${viewer.reference} PDF`}
              className="min-h-0 flex-1 bg-white"
            />
          </section>
        </div>
      )}
    </section>
  );
}
