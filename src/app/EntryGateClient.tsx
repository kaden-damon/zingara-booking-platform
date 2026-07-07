"use client";

import { useState } from "react";

const locations = [
  {
    alt: "Cape Town - Enter The Night Court",
    imageUrl:
      "https://static.wixstatic.com/media/e3c98c_c172ded85e4844a09eae769cda2d00c8~mv2.png/v1/fill/w_1536,h_1023,al_c,q_90,enc_avif,quality_auto/Night%20Court_Postcard.png",
    label: "Cape Town",
    value: "cape-town",
  },
  {
    alt: "Joburg - Enter The Spring Court",
    imageUrl:
      "https://static.wixstatic.com/media/e3c98c_41b1137d458441d1ac0c4df8de9f4dec~mv2.png/v1/fill/w_1536,h_1023,al_c,q_90,enc_avif,quality_auto/Spring%20Court_Postcard.png",
    label: "Johannesburg",
    value: "johannesburg",
  },
] as const;

function rememberLocation(location: string) {
  try {
    window.localStorage.setItem("zingara-selected-location", location);
  } catch {
    // Location persistence is a convenience, not a booking dependency.
  }
}

export default function EntryGateClient() {
  const [selectedLocation, setSelectedLocation] = useState<
    (typeof locations)[number]["value"] | null
  >(null);

  return (
    <div className="mt-12 grid w-full items-center gap-6 px-3 sm:mt-[4.35rem] sm:gap-7 sm:px-0 lg:grid-cols-2 lg:gap-[4.6rem]">
      {locations.map((location, index) => {
        const isSelected = selectedLocation === location.value;
        const isDimmed = Boolean(selectedLocation) && !isSelected;
        const bookHref = `/book?location=${location.value}`;
        const findHref = `/find-booking?location=${location.value}`;

        return (
          <article
            key={location.value}
            className={`group relative transition duration-700 ease-out ${
              isSelected
                ? "scale-[1.018]"
                : "hover:scale-[1.018]"
            } ${
              isDimmed ? "opacity-45 saturate-[0.7]" : "opacity-100"
            }`}
            style={{
              animation: `fadeIn 900ms ease-out ${180 + index * 120}ms both`,
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedLocation(location.value)}
              aria-label={location.alt}
              aria-expanded={isSelected}
              className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d8c36a]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={location.imageUrl}
                alt={location.alt}
                className="h-auto w-full select-none object-contain transition duration-500 ease-out group-hover:brightness-110"
                draggable={false}
              />
            </button>

            <div
              className={`mx-auto grid max-w-xl overflow-hidden transition-all duration-700 ease-out ${
                isSelected
                  ? "mt-4 max-h-36 translate-y-0 opacity-100"
                  : "mt-0 max-h-0 translate-y-2 opacity-0"
              }`}
            >
              <div className="rounded-[1.25rem] border border-[#d8c36a]/25 bg-black/75 p-3 shadow-[0_18px_44px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-4">
                <p
                  className="mb-3 text-center text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#d8c36a]"
                  style={{
                    fontFamily:
                      "var(--font-zingara-subheading), Georgia, serif",
                  }}
                >
                  {location.label}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <a
                    href={bookHref}
                    onClick={() => rememberLocation(location.value)}
                    className="rounded-full bg-[#d8c36a] px-4 py-3 text-center text-[0.72rem] font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#f2d66c]"
                  >
                    Book Your Experience
                  </a>
                  <a
                    href={findHref}
                    onClick={() => rememberLocation(location.value)}
                    className="rounded-full border border-[#d8c36a]/35 bg-black/35 px-4 py-3 text-center text-[0.72rem] font-bold uppercase tracking-[0.14em] text-[#f2d66c] transition hover:border-[#f2d66c] hover:bg-[#d8c36a]/10"
                  >
                    Find My Booking
                  </a>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
