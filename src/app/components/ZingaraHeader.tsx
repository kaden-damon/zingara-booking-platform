"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  adminAuthChangedEvent,
  getAdminAuthSession,
  signOutAdmin,
} from "../../lib/supabase/auth";
import { getVenueSettings } from "../../lib/supabase/venueSettings";
import { defaultVenueSettings } from "../../lib/zingaraDemo";

const navigationItems = [
  {
    href: "https://www.zingara.co.za/",
    isExternal: true,
    label: "Home",
  },
  {
    href: "/book",
    label: "Book",
  },
  {
    href: "/find-booking",
    label: "Find My Booking",
  },
  {
    href: "/corporate",
    label: "Corporate Booking",
  },
  {
    href: "/admin",
    label: "Admin Login",
  },
];

function LoginIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function ZingaraHeader() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [venueSettings, setVenueSettings] = useState(
    defaultVenueSettings,
  );
  const venueConfig = venueSettings;
  const isLandingPage = pathname === "/";
  const needsOperationalTopSpace =
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    pathname === "/find-booking" ||
    pathname.startsWith("/find-booking/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  useEffect(() => {
    let isMounted = true;

    async function loadVenueSettings() {
      const nextVenueSettings = await getVenueSettings();

      if (isMounted) {
        setVenueSettings(nextVenueSettings);
      }
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
      isMounted = false;
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("storage", loadVenueSettings);
      window.removeEventListener(
        "zingara-demo-venue-settings-updated",
        loadVenueSettings,
      );
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadAdminSession() {
      const adminSession = await getAdminAuthSession();

      if (isMounted) {
        setIsAdminLoggedIn(Boolean(adminSession));
      }
    }

    const hydrationTimer = window.setTimeout(loadAdminSession, 0);

    window.addEventListener("storage", loadAdminSession);
    window.addEventListener(
      adminAuthChangedEvent,
      loadAdminSession,
    );

    return () => {
      isMounted = false;
      window.clearTimeout(hydrationTimer);
      window.removeEventListener("storage", loadAdminSession);
      window.removeEventListener(
        adminAuthChangedEvent,
        loadAdminSession,
      );
    };
  }, []);

  useEffect(() => {
    let frameId = 0;

    function updateScrolledState() {
      setIsScrolled(window.scrollY > 12);
    }

    function handleScroll() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateScrolledState);
    }

    const hydrationTimer = window.setTimeout(updateScrolledState, 0);

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      window.clearTimeout(hydrationTimer);
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (isLandingPage) {
    return null;
  }

  async function logoutFromNavigation() {
    await signOutAdmin();
    window.dispatchEvent(new Event(adminAuthChangedEvent));
    setIsAdminLoggedIn(false);
    setIsMenuOpen(false);
    window.location.href = "/book";
  }

  return (
    <header
      className={`pointer-events-none relative z-40 border-b border-[#8D7A2F]/25 bg-black/50 px-4 pb-3 text-white shadow-[0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-xl transition duration-300 sm:z-20 sm:px-5 sm:pb-4 ${
        needsOperationalTopSpace ? "pt-[62px]" : "pt-3 sm:pt-4"
      } ${
        isScrolled
          ? "sm:border-[#8D7A2F]/25 sm:bg-black/50 sm:shadow-[0_12px_32px_rgba(0,0,0,0.22)] sm:backdrop-blur-xl"
          : "sm:border-transparent sm:bg-transparent sm:shadow-none sm:backdrop-blur-0"
      }`}
    >
      <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-3">
        <Link
          href="/book"
          className="pointer-events-auto group mx-auto flex w-fit flex-col items-center text-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={venueConfig.logoUrl}
            alt={venueConfig.brandTitle}
            className="zingara-header-logo h-auto w-28 shrink-0 object-contain drop-shadow-[0_0_18px_rgba(216,195,106,0.2)] transition duration-300 group-hover:drop-shadow-[0_0_24px_rgba(216,195,106,0.34)] min-[390px]:w-32 sm:w-44"
            decoding="async"
          />
          <span className="mt-1.5 block">
            <span className="block text-base font-bold leading-tight tracking-[0.08em] text-white transition group-hover:text-[#F2D66C] sm:text-lg">
              {venueConfig.brandTitle}
            </span>
            <span className="mt-0.5 block text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-[#D8C36A] sm:text-[0.68rem] sm:tracking-[0.22em]">
              {venueConfig.showTitle}
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
          className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-[#D8C36A]/30 bg-black/35 text-[#F2D66C] shadow-[0_0_24px_rgba(216,195,106,0.14)] backdrop-blur-xl transition hover:border-[#F2D66C] sm:h-12 sm:w-12"
          aria-expanded={isMenuOpen}
          aria-label="Open navigation menu"
        >
          <span className="flex w-5 flex-col gap-1.5">
            <span className="h-0.5 rounded-full bg-current" />
            <span className="h-0.5 rounded-full bg-current" />
            <span className="h-0.5 rounded-full bg-current" />
          </span>
        </button>

        <nav
          aria-label="Primary"
          className={`pointer-events-auto absolute left-1/2 top-full mt-3 flex min-w-56 -translate-x-1/2 flex-col gap-2 rounded-[1.25rem] border border-[#8D7A2F]/25 bg-black/90 p-2 shadow-[0_18px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl transition duration-300 ease-out ${
            isMenuOpen
              ? "visible translate-y-0 scale-100 opacity-100"
              : "invisible -translate-y-2 scale-95 opacity-0"
          }`}
        >
          {navigationItems.map((item) => {
            const isAdminItem = item.href === "/admin";
            const itemLabel =
              isAdminItem && isAdminLoggedIn
                ? "Admin Dashboard"
                : item.label;
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.isExternal ? "_blank" : undefined}
                rel={
                  item.isExternal ? "noopener noreferrer" : undefined
                }
                onClick={() => setIsMenuOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.12em] transition sm:px-5 sm:py-3 sm:text-sm sm:tracking-[0.14em] ${
                  isActive
                    ? "border-[#D8C36A] bg-[#D8C36A] text-black shadow-[0_0_28px_rgba(216,195,106,0.2)]"
                    : "border-white/15 bg-black/25 text-zinc-200 hover:border-[#D8C36A]/60 hover:bg-black/35 hover:text-white"
                }`}
              >
                {isAdminItem && <LoginIcon />}
                {itemLabel}
              </Link>
            );
          })}
          {isAdminLoggedIn && (
            <button
              type="button"
              onClick={logoutFromNavigation}
              className="flex items-center justify-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.12em] text-zinc-200 transition hover:border-[#D8C36A]/60 hover:bg-black/35 hover:text-white sm:px-5 sm:py-3 sm:text-sm sm:tracking-[0.14em]"
            >
              <LogoutIcon />
              <span>Logout</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
