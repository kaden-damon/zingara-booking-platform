import type { Metadata } from "next";
import Link from "next/link";

import PaymentBrandMarks from "../components/PaymentBrandMarks";
import { royalDecrees } from "@/lib/royalDecrees";

export const metadata: Metadata = {
  title: "Royal Decrees | The Royal Countess Zingara",
  description:
    "The official policies, terms and information governing your experience with The Royal Countess.",
};

export default function RoyalDecreesPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1A1208_0%,#070707_42%,#000_100%)] px-4 py-12 text-white sm:px-6 sm:py-16">
      <section className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
            Royal Decrees
          </p>
          <h1 className="mt-4 text-4xl font-normal tracking-[0.06em] text-[#F2D66C] sm:text-6xl">
            Legal Centre
          </h1>
          <p className="mt-5 text-base leading-7 text-zinc-300 sm:text-lg">
            The official policies, terms and information governing your
            experience with The Royal Countess.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {royalDecrees.map((decree) => (
            <Link
              key={decree.slug}
              href={decree.href}
              className="group flex min-h-52 flex-col rounded-[1.25rem] border border-[#8D7A2F]/25 bg-black/38 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-1 hover:border-[#D8C36A]/60 hover:bg-black/55 hover:shadow-[0_0_38px_rgba(216,195,106,0.1)]"
            >
              <span className="text-3xl" aria-hidden="true">
                {decree.icon}
              </span>
              <h2 className="mt-4 text-xl font-normal leading-tight text-white">
                {decree.title}
              </h2>
              <p className="mt-4 flex-1 text-sm leading-6 text-zinc-400">
                {decree.summary}
              </p>
              <span className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#F2D66C] transition group-hover:text-white">
                Read Policy
              </span>
            </Link>
          ))}
        </div>

        <section className="mt-10 rounded-[1.25rem] bg-black/30 p-5 text-center sm:p-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
            Accepted Online Payment Methods
          </p>
          <div className="mt-4">
            <PaymentBrandMarks />
          </div>
        </section>
      </section>
    </main>
  );
}
