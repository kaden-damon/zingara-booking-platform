import Link from "next/link";

import { defaultZingaraLandingLogoUrl } from "../lib/zingaraDemo";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center gap-7 px-6 pb-16 pt-28 sm:gap-8 sm:pt-36 lg:pt-44">
      <div
        aria-label="Zingara"
        className="h-64 w-[min(92vw,54rem)] bg-contain bg-center bg-no-repeat sm:h-80 lg:h-96"
        style={{
          backgroundImage: `url("${defaultZingaraLandingLogoUrl}")`,
        }}
      />

      <p className="zingara-subheading text-center text-5xl leading-none text-white sm:text-6xl lg:text-7xl">
        Custom Booking Platform
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/book"
          className="rounded-full bg-white px-8 py-4 text-center text-lg font-semibold text-black transition hover:bg-zinc-300"
        >
          Book Now
        </Link>
        <Link
          href="/corporate"
          className="rounded-full border border-[#D8C36A]/45 bg-black/35 px-8 py-4 text-center text-lg font-semibold text-[#F2D66C] transition hover:border-[#F2D66C] hover:bg-[#D8C36A] hover:text-black"
        >
          Corporate Booking
        </Link>
      </div>
    </main>
  );
}
