import type { Metadata } from "next";
import Link from "next/link";

import AuthRedirectHandler from "./AuthRedirectHandler";
import EntryGateClient from "./EntryGateClient";
import PaymentBrandMarks from "./components/PaymentBrandMarks";
import { royalDecrees } from "../lib/royalDecrees";

export const metadata: Metadata = {
  title: "ENTRY GATE | The Royal Countess Zingara",
  description: "Choose your Zingara venue and begin your booking experience.",
};

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <AuthRedirectHandler />
      <section className="mx-auto flex min-h-screen w-full max-w-[132rem] flex-col items-center px-0 pb-9 pt-10 sm:px-5 sm:pt-12 lg:px-0 lg:pt-[5.55rem]">
        <div className="animate-[fadeIn_900ms_ease-out_both] text-center">
          <h1
            className="text-balance text-[2.5rem] leading-[0.95] tracking-[0.035em] text-[#d8c36a] sm:text-[4.2rem] lg:text-[4.8rem] xl:text-[5.15rem]"
            style={{
              fontFamily: "var(--font-zingara-subheading), Georgia, serif",
              fontWeight: 400,
              textShadow: "0 0 1px rgba(255,255,255,0.32)",
            }}
          >
            TWO COURTS. ONE KINGDOM.
          </h1>
          <p
            className="mt-3 text-[1.75rem] leading-none tracking-[0.045em] text-[#f5f0e7] sm:mt-4 sm:text-[2.65rem] lg:text-[3rem]"
            style={{
              fontFamily: "var(--font-zingara-subheading), Georgia, serif",
              fontWeight: 400,
              textShadow: "0 0 1px rgba(255,255,255,0.4)",
            }}
          >
            WHERE WILL YOU TAKE YOUR SEAT?
          </p>
        </div>

        <EntryGateClient />

        <footer
          className="mt-auto pt-10 text-center text-[0.74rem] leading-relaxed text-white/80 sm:pt-12"
          style={{
            fontFamily: "var(--font-zingara-subheading), Georgia, serif",
          }}
        >
          <div className="mx-auto mb-5 max-w-4xl">
            <Link
              href="/royal-decrees"
              className="text-[0.82rem] uppercase tracking-[0.18em] text-[#F2D66C] transition hover:text-white"
            >
              Royal Decrees
            </Link>
            <nav
              aria-label="Royal Decrees"
              className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[0.68rem] uppercase tracking-[0.12em] text-white/76"
            >
              {royalDecrees.map((decree) => (
                <Link
                  key={decree.slug}
                  href={decree.href}
                  className="transition hover:text-[#F2D66C]"
                >
                  {decree.title === "Booking & Cancellation Policy"
                    ? "Refund & Cancellation"
                    : decree.title === "Contact & Company Information"
                      ? "Contact"
                      : decree.title === "Access to Information (PAIA)"
                        ? "PAIA Manual"
                      : decree.title}
                </Link>
              ))}
            </nav>
            <div className="mx-auto mt-4 max-w-3xl">
              <p className="text-center text-[0.62rem] uppercase tracking-[0.16em] text-[#F2D66C]">
                Accepted Payment Methods
              </p>
              <div className="mt-2">
                <PaymentBrandMarks compact />
              </div>
            </div>
          </div>
          <p>© 2026 House of Zingara.</p>
          <p>All rights reserved by royal decree</p>
        </footer>
      </section>
    </main>
  );
}
