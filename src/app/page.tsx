import type { Metadata } from "next";

import AuthRedirectHandler from "./AuthRedirectHandler";
import EntryGateClient from "./EntryGateClient";

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
          className="mt-auto pt-10 text-center text-[0.74rem] leading-relaxed text-white/42 sm:pt-12"
          style={{
            fontFamily: "var(--font-zingara-subheading), Georgia, serif",
          }}
        >
          <p>© 2026 House of Zingara.</p>
          <p>All rights reserved by royal decree</p>
        </footer>
      </section>
    </main>
  );
}
