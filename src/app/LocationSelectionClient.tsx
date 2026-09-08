"use client";

import { useEffect, useState } from "react";

import {
  getPublicBookingSalesStatusFromConfiguration,
  type PublicBookingConfiguration,
} from "@/lib/publicBookingSales";
import { getPublicVenueSettings } from "@/lib/supabase/venueSettings";
import PublicBookingCountdown from "./PublicBookingCountdown";

const locations = [
  {
    alt: "Cape Town - Enter The Night Court",
    imageUrl:
      "https://static.wixstatic.com/media/e3c98c_c172ded85e4844a09eae769cda2d00c8~mv2.png/v1/fill/w_1536,h_1023,al_c,q_90,enc_avif,quality_auto/Night%20Court_Postcard.png",
    label: "Cape Town",
    seasonLabel: "MELANINA | SEASON TWO",
    value: "cape-town",
  },
  {
    alt: "Joburg - Enter The Spring Court",
    imageUrl:
      "https://static.wixstatic.com/media/e3c98c_41b1137d458441d1ac0c4df8de9f4dec~mv2.png/v1/fill/w_1536,h_1023,al_c,q_90,enc_avif,quality_auto/Spring%20Court_Postcard.png",
    label: "Johannesburg",
    seasonLabel: "LA DOLCE ROYAL | SEASON ONE",
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

type LocationSelectionClientProps = {
  initialNow: number;
  initialPublicBookings: PublicBookingConfiguration | null;
};

export default function LocationSelectionClient({
  initialNow,
  initialPublicBookings,
}: LocationSelectionClientProps) {
  const [selectedLocation, setSelectedLocation] = useState<
    (typeof locations)[number]["value"] | null
  >(null);
  const [publicBookings, setPublicBookings] =
    useState<PublicBookingConfiguration | null>(initialPublicBookings);
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    let isMounted = true;

    void getPublicVenueSettings().then((settings) => {
      if (isMounted) {
        setPublicBookings(settings.operationalSettings.publicBookings);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mt-12 grid w-full items-center gap-8 sm:mt-[4.35rem] sm:gap-7 lg:grid-cols-2 lg:gap-[4.6rem]">
      {locations.map((location, index) => {
        const isSelected = selectedLocation === location.value;
        const isDimmed = Boolean(selectedLocation) && !isSelected;
        const bookHref = `/book?location=${location.value}`;
        const findHref = `/find-booking?location=${location.value}`;
        const publicBookingStatus = getPublicBookingSalesStatusFromConfiguration(
          publicBookings,
          location.value,
          new Date(now),
        );
        const isPublicBookingOpen = publicBookingStatus.state === "open";

        return (
          <article
            key={location.value}
            className={`group relative transition duration-700 ease-out motion-reduce:transition-none ${
              isSelected
                ? "mb-[10.5rem] sm:mb-[8.25rem] sm:scale-[1.018]"
                : "hover:scale-[1.018]"
            } ${
              isDimmed ? "opacity-45 saturate-[0.7]" : "opacity-100"
            }`}
            style={{
              animation: `fadeIn 900ms ease-out ${180 + index * 120}ms both`,
            }}
          >
            <div
              className={`absolute inset-x-0 top-0 z-0 mx-auto grid max-w-xl transition-all duration-700 ease-out motion-reduce:transition-none ${
                isSelected
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-2 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100"
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
                  {isPublicBookingOpen ? (
                    <a
                      href={bookHref}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => rememberLocation(location.value)}
                      className="rounded-full bg-[#d8c36a] px-4 py-3 text-center text-[0.72rem] font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#f2d66c]"
                    >
                      Book Your Experience
                    </a>
                  ) : publicBookingStatus.state === "scheduled" ? (
                    <PublicBookingCountdown
                      now={now}
                      opensAt={publicBookingStatus.opensAt}
                    />
                  ) : (
                    <span
                      aria-disabled="true"
                      className="flex min-h-11 items-center justify-center rounded-full border border-[#d8c36a]/35 bg-[#d8c36a]/10 px-4 py-3 text-center text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#f2d66c]"
                    >
                      Bookings Closed
                    </span>
                  )}
                  <a
                    href={findHref}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => rememberLocation(location.value)}
                    className="rounded-full border border-[#d8c36a]/35 bg-black/35 px-4 py-3 text-center text-[0.72rem] font-bold uppercase tracking-[0.14em] text-[#f2d66c] transition hover:border-[#f2d66c] hover:bg-[#d8c36a]/10"
                  >
                    Find My Booking
                  </a>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedLocation(location.value)}
              aria-label={location.alt}
              aria-expanded={isSelected}
              className={`relative z-10 block w-full transition-transform duration-700 ease-out motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d8c36a] ${
                isSelected
                  ? "translate-y-[10.5rem] sm:translate-y-[8.25rem]"
                  : "group-hover:translate-y-[10.5rem] sm:group-hover:translate-y-[8.25rem]"
              }`}
            >
              <p
                className="mb-3 px-2 text-center text-[calc(0.67rem+2px)] font-medium uppercase leading-relaxed tracking-[0.13em] text-[#d8c36a] sm:mb-4 sm:text-[calc(0.72rem+2px)]"
                style={{
                  fontFamily:
                    "var(--font-zingara-subheading), Georgia, serif",
                }}
              >
                {location.seasonLabel}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={location.imageUrl}
                alt={location.alt}
                className="h-auto w-full select-none object-contain transition duration-500 ease-out group-hover:brightness-110"
                draggable={false}
              />
            </button>
          </article>
        );
      })}
    </div>
  );
}
