import type { Metadata } from "next";

const bookingUrl = "https://book.zingara.co.za/book";

const locations = [
  {
    alt: "Cape Town - Enter The Night Court",
    imageUrl:
      "https://static.wixstatic.com/media/e3c98c_c172ded85e4844a09eae769cda2d00c8~mv2.png/v1/fill/w_1536,h_1023,al_c,q_90,enc_avif,quality_auto/Night%20Court_Postcard.png",
  },
  {
    alt: "Joburg - Enter The Spring Court",
    imageUrl:
      "https://static.wixstatic.com/media/e3c98c_41b1137d458441d1ac0c4df8de9f4dec~mv2.png/v1/fill/w_1536,h_1023,al_c,q_90,enc_avif,quality_auto/Spring%20Court_Postcard.png",
  },
];

export const metadata: Metadata = {
  title: "Zingara Booking Platform",
  description: "Choose your Zingara venue and begin your booking experience.",
};

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
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

        <div className="mt-12 grid w-full items-center gap-6 px-3 sm:mt-[4.35rem] sm:gap-7 sm:px-0 lg:grid-cols-2 lg:gap-[4.6rem]">
          {locations.map((location, index) => (
            <a
              key={location.alt}
              href={bookingUrl}
              aria-label={location.alt}
              className="group block transition duration-500 ease-out hover:scale-[1.018] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d8c36a]"
              style={{
                animation: `fadeIn 900ms ease-out ${180 + index * 120}ms both`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={location.imageUrl}
                alt={location.alt}
                className="h-auto w-full select-none object-contain transition duration-500 ease-out group-hover:brightness-110"
                draggable={false}
              />
            </a>
          ))}
        </div>

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
