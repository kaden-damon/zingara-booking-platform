import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import PaymentBrandMarks from "../../components/PaymentBrandMarks";
import {
  getRoyalDecree,
  royalDecrees,
} from "@/lib/royalDecrees";

type RoyalDecreePageProps = {
  params: Promise<{
    policy: string;
  }>;
};

export function generateStaticParams() {
  return royalDecrees.map((decree) => ({
    policy: decree.slug,
  }));
}

export async function generateMetadata({
  params,
}: RoyalDecreePageProps): Promise<Metadata> {
  const { policy } = await params;
  const decree = getRoyalDecree(policy);

  if (!decree) {
    return {
      title: "Royal Decrees | The Royal Countess Zingara",
    };
  }

  return {
    title: `${decree.title} | Royal Decrees`,
    description: decree.summary,
  };
}

export default async function RoyalDecreePolicyPage({
  params,
}: RoyalDecreePageProps) {
  const { policy } = await params;
  const decree = getRoyalDecree(policy);

  if (!decree) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1A1208_0%,#070707_42%,#000_100%)] px-4 py-12 text-white sm:px-6 sm:py-16">
      <article className="mx-auto max-w-4xl">
        <Link
          href="/royal-decrees"
          className="inline-flex rounded-full border border-[#D8C36A]/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#F2D66C] transition hover:bg-[#D8C36A] hover:text-black"
        >
          Back To Royal Decrees
        </Link>

        <header className="mt-9 border-b border-[#8D7A2F]/30 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
            Royal Decrees
          </p>
          <h1 className="mt-4 text-4xl font-normal tracking-[0.05em] text-[#F2D66C] sm:text-6xl">
            {decree.title}
          </h1>
          <p className="mt-5 text-base leading-7 text-zinc-300 sm:text-lg">
            {decree.summary}
          </p>
        </header>

        <div className="mt-8 space-y-8">
          {decree.sections.map((section) => (
            <section
              key={section.heading}
              className="border-l border-[#8D7A2F]/45 pl-5 sm:pl-7"
            >
              <h2 className="text-xl font-normal text-[#F2D66C]">
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-300 sm:text-base">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.items && section.items.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-sm leading-7 text-zinc-200 sm:text-base">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="whitespace-pre-line text-zinc-200"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {decree.slug === "payment-terms" && (
            <section className="rounded-[1.25rem] bg-black/30 p-5 text-center sm:p-6">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#D8C36A]">
                PayFast-Approved Payment Branding
              </p>
              <div className="mt-4">
                <PaymentBrandMarks />
              </div>
            </section>
          )}
        </div>
      </article>
    </main>
  );
}
