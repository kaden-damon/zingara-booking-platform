"use client";

import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AdminCollapsibleSection } from "@/app/admin/AdminCollapsibleSection";
import {
  getDefaultOpenQuickStartSections,
  getQuickStartSectionIds,
  type QuickStartSectionId,
} from "@/lib/quickStartGuide";
import { getAdminLoginPath } from "@/lib/adminReturnPath";
import { getAdminAuthSession } from "@/lib/supabase/auth";
import type { AdminRole, Permission } from "@/lib/zingaraAccess";

type QuickStartContext = {
  entryGatePassword: string;
  staff: {
    canProcessRefund: boolean;
    locationLabel: string;
    name: string;
    permissions: Permission[];
    role: AdminRole;
    roleLabel: string;
  };
};

type GuideCard = {
  action?: { href: string; label: string };
  content: ReactNode;
  id: QuickStartSectionId;
  purpose: string;
  title: string;
};

const buttonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#D8C36A] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] sm:w-auto";
const secondaryButtonClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.1em] text-zinc-200 transition hover:border-[#D8C36A]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C]";

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-300 marker:font-semibold marker:text-[#D8C36A]">
      {children}
    </ol>
  );
}

function Note({ children, critical = false }: { children: ReactNode; critical?: boolean }) {
  return (
    <p
      className={`rounded-xl border p-3 text-sm leading-6 ${
        critical
          ? "border-amber-300/35 bg-amber-950/20 font-semibold text-amber-100"
          : "border-white/10 bg-black/35 text-zinc-300"
      }`}
    >
      {children}
    </p>
  );
}

function getLocationContext(locationLabel: string) {
  if (locationLabel.toLowerCase().includes("cape town")) {
    return "Your operational links and show choices should remain within Cape Town unless your access changes.";
  }

  if (locationLabel.toLowerCase().includes("johannesburg")) {
    return "Your operational links and show choices should remain within Johannesburg unless your access changes.";
  }

  if (locationLabel === "All Locations") {
    return "Confirm the correct Johannesburg or Cape Town performance before taking an operational action.";
  }

  return "Confirm your assigned location before taking an operational action.";
}

function buildGuideCards(context: QuickStartContext): Record<QuickStartSectionId, GuideCard> {
  const refundContent = context.staff.canProcessRefund ? (
    <div className="space-y-4">
      <Note critical>
        Never retry a refund if the result is uncertain. Check the provider and reconciliation state first.
      </Note>
      <Steps>
        <li>Open the paid booking and select Refund Booking.</li>
        <li>Verify the booking and refund amount.</li>
        <li>Enter a clear refund reason.</li>
        <li>Confirm with your current staff password.</li>
        <li>Process the refund once only.</li>
      </Steps>
    </div>
  ) : (
    <Note critical>
      Refunds are restricted to authorised Finance staff. Contact Kaden Damon or Wagheeda Abrahams.
    </Note>
  );

  return {
    analytics: {
      action: { href: "/admin?section=analytics", label: "Open Dashboard & Analytics" },
      content: (
        <ul className="space-y-2 text-sm leading-6 text-zinc-300">
          <li>Review show status, occupancy and revenue.</li>
          <li>Monitor booking activity and operational signals.</li>
          <li>Use Live Platform Activity only as the safe operational view provided.</li>
        </ul>
      ),
      id: "analytics",
      purpose: "Monitor performance, demand and operational activity.",
      title: "Dashboard & Analytics",
    },
    bookings: {
      action: { href: "/admin?section=bookings", label: "Open Bookings" },
      content: (
        <div className="space-y-4">
          <Steps>
            <li>Open Bookings.</li>
            <li>Search by guest, booking reference, email or another supported field.</li>
            <li>Open Booking Details.</li>
            <li>Review booking, payment, table and ticket status before changing anything.</li>
            <li>Save only the required changes.</li>
          </Steps>
          <Note>
            Source / Created By identifies where the booking originated and, where applicable, which staff member created or imported it.
          </Note>
        </div>
      ),
      id: "bookings",
      purpose: "Find, review and manage guest bookings.",
      title: "Bookings",
    },
    communications: {
      action: { href: "/admin?section=communications", label: "Open Communications" },
      content: (
        <div className="space-y-4 text-sm leading-6 text-zinc-300">
          <p>Use Booking Communication History, resend ticket, custom messaging and payment-link communication only where authorised.</p>
          <Note>Review Communication History before resending something unnecessarily.</Note>
        </div>
      ),
      id: "communications",
      purpose: "Review and send authorised guest communication.",
      title: "Communications",
    },
    corporate: {
      action: { href: "/admin?section=corporate", label: "Open Corporate Bookings" },
      content: (
        <div className="space-y-4">
          <Steps>
            <li>Open Corporate Bookings.</li>
            <li>Search by contact or company.</li>
            <li>Confirm requested date, pax and seating.</li>
            <li>Review quote and payment status.</li>
            <li>Check for an existing record before creating anything new.</li>
          </Steps>
          <Note>Avoid duplicate Corporate enquiries or bookings.</Note>
        </div>
      ),
      id: "corporate",
      purpose: "Review and manage Corporate enquiries and bookings.",
      title: "Corporate Bookings",
    },
    customers: {
      action: { href: "/admin?section=customers", label: "Open Customers" },
      content: (
        <div className="space-y-4 text-sm leading-6 text-zinc-300">
          <p>Search Customer CRM, review booking history, attendance, spend, notes and preferences, then edit details only where permitted.</p>
          <Note>Customer records and staff accounts are separate identities.</Note>
        </div>
      ),
      id: "customers",
      purpose: "Understand and maintain the authoritative guest profile.",
      title: "Customers",
    },
    floor: {
      action: { href: "/admin?section=floor", label: "Open Floor" },
      content: (
        <div className="space-y-3 text-sm leading-6 text-zinc-300">
          <p><strong className="text-white">Floor Assignment Queue:</strong> bookings still requiring operational placement.</p>
          <p><strong className="text-white">Initial Floor Auto-Allocator:</strong> creates a safe initial floor for unresolved same-zone bookings and preserves valid staff allocations.</p>
          <p><strong className="text-white">Temporary Table:</strong> a show-specific operational table used only where physical capacity is genuinely available.</p>
          <p><strong className="text-white">Merged Table:</strong> compatible operational tables combined for a larger party.</p>
          <p><strong className="text-white">Cross-Zone Move:</strong> a deliberate staff move to another seating section.</p>
          <Note critical>The Auto-Allocator never moves guests between seating zones automatically.</Note>
        </div>
      ),
      id: "floor",
      purpose: "Allocate confirmed bookings to operational tables.",
      title: "Floor & Tables",
    },
    help: {
      action: { href: "/admin?section=platform-operations", label: "Report an Issue" },
      content: (
        <Steps>
          <li>Do not create duplicate records to work around a problem.</li>
          <li>Do not repeatedly submit payment or refund actions.</li>
          <li>Capture the booking reference or show details.</li>
          <li>Use the existing issue-reporting workflow.</li>
          <li>Add a concise description and screenshot where useful.</li>
        </Steps>
      ),
      id: "help",
      purpose: "Report an operational problem without making it worse.",
      title: "Need Help?",
    },
    "payment-controls": {
      action: { href: "/admin?section=bookings", label: "Open Payment Controls" },
      content: (
        <div className="space-y-3 text-sm leading-6 text-zinc-300">
          <p><strong className="text-white">Mark Deposit Paid:</strong> records an authorised manual deposit payment.</p>
          <p><strong className="text-white">Mark Paid:</strong> records an authorised manual full payment.</p>
          <p><strong className="text-white">Send Payment Link:</strong> creates and sends the outstanding-payment workflow.</p>
          <p><strong className="text-white">Comp Booking:</strong> uses the complimentary-booking workflow where authorised.</p>
          <Note critical>Always verify the payment before manually marking a booking paid.</Note>
        </div>
      ),
      id: "payment-controls",
      purpose: "Use deliberate, authorised controls for a booking balance.",
      title: "Payment Controls",
    },
    payments: {
      action: { href: "/admin?section=bookings", label: "Open Booking Payments" },
      content: (
        <div className="space-y-4 text-sm leading-6 text-zinc-300">
          <p>Review booking amount, deposit, amount paid and outstanding balance before taking action.</p>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-[#D8C36A]/25 bg-[#120D05] p-4 sm:max-w-sm">
            <p className="flex justify-between gap-4"><span>Booking Amount Due</span><strong className="text-white">R550</strong></p>
            <p className="flex justify-between gap-4"><span>Transaction Fee</span><strong className="text-white">R10</strong></p>
            <p className="flex justify-between gap-4 border-t border-white/10 pt-2"><span>Total Payable</span><strong className="text-[#F2D66C]">R560</strong></p>
          </div>
          <Note>The R10 Transaction Fee is charged once per positive PayFast transaction, not per guest. It does not reduce the booking outstanding balance.</Note>
        </div>
      ),
      id: "payments",
      purpose: "Understand the authoritative balance and payment workflow.",
      title: "Payments",
    },
    refunds: {
      action: context.staff.canProcessRefund
        ? { href: "/admin?section=bookings", label: "Open Refund Controls" }
        : undefined,
      content: refundContent,
      id: "refunds",
      purpose: context.staff.canProcessRefund
        ? "Process a supported provider refund once and reconcile safely."
        : "Understand who may process a provider refund.",
      title: "Refunds",
    },
    "table-plan": {
      action: { href: "/admin?section=analytics", label: "Open Table Plan" },
      content: (
        <div className="space-y-4 text-sm leading-6 text-zinc-300">
          <p>Generate the operational Table Plan for one selected show through the existing Admin reporting workflow.</p>
          <p>It includes operational table allocations, guest names, pax, currently deployed payment information, outstanding balances, notes and the Final Checklist.</p>
          <Note>Phase 39.17 financial classification is still being finalised. Use only the payment information currently present in the deployed export.</Note>
        </div>
      ),
      id: "table-plan",
      purpose: "Prepare the existing operational workbook for a selected show.",
      title: "Table Plan",
    },
    tickets: {
      action: { href: "/admin?section=check-in", label: "Scan Tickets" },
      content: (
        <div className="space-y-4 text-sm leading-6 text-zinc-300">
          <p>Use Scan Tickets for QR validation, then confirm the booking, table, zone and validation result. Use guest lookup or Resend Ticket only where authorised.</p>
          <Note critical>If a ticket does not validate, do not simply admit the guest or recreate the ticket. Verify the booking first.</Note>
        </div>
      ),
      id: "tickets",
      purpose: "Validate a guest ticket and confirm the correct arrival details.",
      title: "Tickets & Door",
    },
    "zone-full": {
      action: { href: "/admin?section=floor", label: "Open Floor" },
      content: (
        <div className="space-y-4">
          <Steps>
            <li>Confirm the current zone genuinely cannot accommodate the booking.</li>
            <li>Check for an existing operational or merged table.</li>
            <li>If physically appropriate, create a temporary table in the destination zone.</li>
            <li>Open the booking and use Move to Table / Zone.</li>
            <li>Select the new table and review the seating-zone warning.</li>
            <li>Confirm only when the move is operationally required.</li>
          </Steps>
          <Note>A manual seating-zone move does not automatically change the guest&apos;s historical booking price or payment obligation.</Note>
        </div>
      ),
      id: "zone-full",
      purpose: "Resolve genuine floor pressure without inventing capacity or pricing changes.",
      title: "When a Zone Is Full",
    },
  };
}

export default function QuickStartPage() {
  const [context, setContext] = useState<QuickStartContext | null>(null);
  const [error, setError] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      const authSession = await getAdminAuthSession();

      if (!authSession) {
        window.location.replace(
          getAdminLoginPath(
            `${window.location.pathname}${window.location.search}${window.location.hash}`,
          ),
        );
        return;
      }

      const response = await fetch("/api/admin/quick-start", {
        headers: {
          Authorization: `Bearer ${authSession.session.access_token}`,
        },
      });
      const payload = (await response.json().catch(() => ({}))) as
        | QuickStartContext
        | { error?: string };

      if (cancelled) {
        return;
      }

      if (!response.ok || !("staff" in payload)) {
        if (response.status === 401) {
          window.location.replace(
            getAdminLoginPath(
              `${window.location.pathname}${window.location.search}${window.location.hash}`,
            ),
          );
          return;
        }

        if (response.status === 403) {
          window.location.replace("/admin");
          return;
        }

        setError(
          "error" in payload && payload.error
            ? payload.error
            : "Quick Start could not be loaded.",
        );
        return;
      }

      setContext(payload);
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, []);

  const sectionIds = useMemo(
    () =>
      context
        ? getQuickStartSectionIds({
            canProcessRefund: context.staff.canProcessRefund,
            permissions: context.staff.permissions,
            role: context.staff.role,
          })
        : [],
    [context],
  );
  const defaultOpenSections = useMemo(
    () => getDefaultOpenQuickStartSections(sectionIds),
    [sectionIds],
  );
  const cards = useMemo(() => (context ? buildGuideCards(context) : null), [context]);

  async function copyEntryGatePassword() {
    if (!context) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(context.entryGatePassword);
      } else {
        const fallback = document.createElement("textarea");
        fallback.value = context.entryGatePassword;
        fallback.setAttribute("readonly", "");
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();

        if (!document.execCommand("copy")) {
          throw new Error("Clipboard copy was not accepted.");
        }

        fallback.remove();
      }

      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy unavailable. Use Show and copy manually.");
    }
  }

  if (!context || !cards) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">Quick Start</p>
          <p className="mt-3 text-sm text-zinc-300">{error || "Loading your staff guide..."}</p>
          {error && (
            <Link href="/admin" className={`${buttonClass} mt-5`}>
              Return to Admin
            </Link>
          )}
        </div>
      </main>
    );
  }

  const locationContext = getLocationContext(context.staff.locationLabel);

  return (
    <main id="top" className="min-h-screen overflow-x-clip bg-[#050505] px-3 py-5 text-white sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="rounded-2xl border border-[#D8C36A]/30 bg-[radial-gradient(circle_at_top,#21170B_0%,#090909_52%,#030303_100%)] p-5 shadow-2xl shadow-black/35 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">Quick Start</p>
              <h1 className="mt-2 text-3xl font-bold uppercase sm:text-4xl">Welcome to Zingara</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base">
                Everything you need to start using the Booking Platform. This guide is personalised to your staff access and location. For detailed training, use Academy.
              </p>
            </div>
            <Link href="/admin" className={secondaryButtonClass}>
              Return to Admin
            </Link>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["Signed in as", context.staff.name],
              ["Role", context.staff.roleLabel],
              ["Location", context.staff.locationLabel],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl border border-white/10 bg-black/35 p-4">
                <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm leading-6 text-zinc-400">{locationContext}</p>
        </header>

        <section aria-labelledby="quick-links-heading" className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/85 p-4 sm:p-5">
          <h2 id="quick-links-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">Quick Links</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="#access-setup" className={secondaryButtonClass}>Access</a>
            {sectionIds.map((sectionId) => (
              <a key={sectionId} href={`#${sectionId}`} className={secondaryButtonClass}>
                {cards[sectionId].title}
              </a>
            ))}
            <a href="#quick-reference" className={secondaryButtonClass}>Reference</a>
          </div>
        </section>

        <section id="access-setup" className="mt-4 scroll-mt-4">
          <AdminCollapsibleSection defaultOpen title="Access & Setup" summary="Platform links, Entry Gate access and device setup">
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <a href="https://book.zingara.co.za" className="rounded-xl border border-white/10 bg-black/35 p-4 transition hover:border-[#D8C36A]/50 focus-visible:outline-2 focus-visible:outline-[#F2D66C]">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Booking Platform</span>
                  <span className="mt-2 block break-all text-sm text-[#F2D66C]">book.zingara.co.za</span>
                </a>
                <a href="https://book.zingara.co.za/admin" className="rounded-xl border border-white/10 bg-black/35 p-4 transition hover:border-[#D8C36A]/50 focus-visible:outline-2 focus-visible:outline-[#F2D66C]">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Admin / Box Office</span>
                  <span className="mt-2 block break-all text-sm text-[#F2D66C]">book.zingara.co.za/admin</span>
                </a>
              </div>

              <div className="rounded-xl border border-[#D8C36A]/25 bg-[#120D05] p-4">
                <label htmlFor="entry-gate-password" className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">Entry Gate Password</label>
                <input
                  id="entry-gate-password"
                  aria-label="Entry Gate password"
                  readOnly
                  type={isPasswordVisible ? "text" : "password"}
                  value={context.entryGatePassword}
                  className="mt-3 min-h-12 w-full rounded-xl border border-white/10 bg-black px-4 text-base text-white outline-none focus:border-[#D8C36A]/70"
                />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                  <button type="button" onClick={() => setIsPasswordVisible((visible) => !visible)} className={secondaryButtonClass} aria-label={isPasswordVisible ? "Hide Entry Gate password" : "Show Entry Gate password"}>
                    {isPasswordVisible ? "Hide" : "Show"}
                  </button>
                  <button type="button" onClick={() => void copyEntryGatePassword()} className={secondaryButtonClass} aria-label="Copy Entry Gate password">
                    Copy
                  </button>
                </div>
                <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-zinc-400">{copyStatus}</p>
              </div>

              <Note>Use your individual Zingara staff account to sign in. Never share your personal staff password.</Note>
              <p className="text-sm text-zinc-300">Bookmark the Admin page on the device you normally use.</p>
            </div>
          </AdminCollapsibleSection>
        </section>

        <aside className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-950/20 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-amber-100">Your Account Identifies You</h2>
          <p className="mt-2 text-sm leading-6 text-amber-50/85">Zingara records staff actions for operational accountability. Always use your own login and sign out when using a shared device.</p>
        </aside>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {sectionIds.map((sectionId) => {
            const card = cards[sectionId];
            const defaultOpen =
              defaultOpenSections.has(sectionId) ||
              (sectionId === "refunds" && context.staff.canProcessRefund);

            return (
              <div key={sectionId} id={sectionId} className="scroll-mt-4 md:col-span-1">
                <AdminCollapsibleSection defaultOpen={defaultOpen} title={card.title} summary={card.purpose} className="h-full">
                  <div className="space-y-5">
                    {card.content}
                    {card.action && (
                      <Link href={card.action.href} className={buttonClass}>
                        {card.action.label}
                      </Link>
                    )}
                    {(sectionId === "floor" || sectionId === "payments" || sectionId === "tickets") && (
                      <Link href="/admin?section=academy" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#F2D66C] underline decoration-[#D8C36A]/40 underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-[#F2D66C]">
                        Learn more in Academy
                      </Link>
                    )}
                  </div>
                </AdminCollapsibleSection>
              </div>
            );
          })}
        </div>

        <section id="quick-reference" className="mt-4 scroll-mt-4 rounded-2xl border border-[#D8C36A]/25 bg-zinc-950/85 p-5 sm:p-6">
          <h2 className="text-xl font-bold uppercase text-white">Quick Reference</h2>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sectionIds
              .filter((sectionId) => cards[sectionId].action)
              .map((sectionId) => (
                <Link key={sectionId} href={cards[sectionId].action!.href} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-[#D8C36A]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-[#F2D66C]">
                  <span>{cards[sectionId].action!.label}</span>
                  <span aria-hidden="true" className="text-[#D8C36A]">&gt;</span>
                </Link>
              ))}
            <Link href="/admin?section=academy" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-[#D8C36A]/50 hover:text-white focus-visible:outline-2 focus-visible:outline-[#F2D66C]">
              <span>Detailed Training</span>
              <span aria-hidden="true" className="text-[#D8C36A]">&gt;</span>
            </Link>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-[#D8C36A]/30 bg-[#120D05] p-5 text-center sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">Need More Detail?</p>
          <h2 className="mt-2 text-2xl font-bold text-white">Open Zingara Academy</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-300">The Quick Start Guide covers everyday essentials. Academy contains full training, policies and detailed walkthroughs.</p>
          <Link href="/admin?section=academy" className={`${buttonClass} mt-5`}>Open Academy</Link>
        </section>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <a href="#top" className={secondaryButtonClass}>Return to Top</a>
          <Link href="/admin" className={secondaryButtonClass}>Return to Admin</Link>
        </div>
      </div>
    </main>
  );
}
