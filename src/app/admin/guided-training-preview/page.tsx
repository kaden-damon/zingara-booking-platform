import { notFound } from "next/navigation";

import GuidedTraining from "../GuidedTraining";

export const dynamic = "force-dynamic";

export default async function GuidedTrainingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key = "" } = await searchParams;
  const configuredKey = process.env.ACADEMY_GUIDED_TRAINING_PREVIEW_KEY;
  if (
    process.env.NODE_ENV === "production" ||
    !configuredKey ||
    key.length !== configuredKey.length ||
    key !== configuredKey
  ) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-black px-3 py-5 text-white sm:px-6 sm:py-8">
      <section className="mx-auto max-w-7xl">
        <header className="mb-5 border-b border-white/10 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#D8C36A]">
            Guided Training
          </p>
          <h1 className="mt-2 text-3xl font-bold uppercase sm:text-4xl">
            Zingara Academy
          </h1>
        </header>
        <GuidedTraining
          initialBootstrap={{
            persistence: "preview-session",
            progress: [],
            staffId: "local-management-preview",
          }}
          previewKey={key}
        />
      </section>
    </main>
  );
}
