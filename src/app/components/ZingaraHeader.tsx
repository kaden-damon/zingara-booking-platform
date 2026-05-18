"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  defaultVenueSettings,
  getStoredVenueSettings,
} from "../../lib/zingaraDemo";

const navigationItems = [
  {
    href: "/book",
    label: "Book Experience",
  },
  {
    href: "/admin",
    label: "Admin Portal",
  },
];

export default function ZingaraHeader() {
  const pathname = usePathname();
  const [venueSettings, setVenueSettings] = useState(
    defaultVenueSettings,
  );
  const venueConfig = venueSettings;

  useEffect(() => {
    function loadVenueSettings() {
      setVenueSettings(getStoredVenueSettings());
    }

    const hydrationTimer = window.setTimeout(
      loadVenueSettings,
      0,
    );

    window.addEventListener("storage", loadVenueSettings);
    window.addEventListener(
      "zingara-demo-venue-settings-updated",
      loadVenueSettings,
    );

    return () => {
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("storage", loadVenueSettings);
      window.removeEventListener(
        "zingara-demo-venue-settings-updated",
        loadVenueSettings,
      );
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-[#8D7A2F]/25 bg-black/90 px-5 py-4 text-white shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/book"
          className="group inline-flex items-center gap-3"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full border border-[#D8C36A]/50 bg-[#2A1710] text-lg font-bold text-[#F2D66C] shadow-[0_0_24px_rgba(216,195,106,0.16)]">
            {venueConfig.logoUrl ? (
              <span
                aria-hidden="true"
                className="h-full w-full rounded-full bg-cover bg-center"
                style={{
                  backgroundImage: `url("${venueConfig.logoUrl}")`,
                }}
              />
            ) : (
              venueConfig.logoInitial
            )}
          </span>
          <span>
            <span className="block text-xl font-bold leading-tight tracking-[0.08em] text-white transition group-hover:text-[#F2D66C]">
              {venueConfig.brandTitle}
            </span>
            <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-[#D8C36A]">
              {venueConfig.showTitle}
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          {navigationItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-full border px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition ${
                  isActive
                    ? "border-[#D8C36A] bg-[#D8C36A] text-black shadow-[0_0_28px_rgba(216,195,106,0.2)]"
                    : "border-white/15 bg-white/[0.03] text-zinc-300 hover:border-[#D8C36A]/60 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
