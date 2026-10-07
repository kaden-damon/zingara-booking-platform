import { getActorRoleLabel } from "@/lib/auditTrail";
import {
  loadActiveCorporateBuyoutSummaries,
  loadCorporateBuyoutPackages,
} from "@/lib/supabase/corporateBuyoutsServer";
import { loadCompanies } from "@/lib/supabase/companyMasterServer";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  normalizeStaffVenueScope,
} from "@/lib/staffLocations";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

const activeBookingStatuses = [
  "new",
  "confirmed",
  "pending_payment",
  "checked_in",
] as const;

function roleRow(
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
) {
  return Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile?.roles[0]
    : auth.staffProfile?.roles;
}

function canView(
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
) {
  return getRolePermissions(roleRow(auth)).includes("bookings:manage");
}

function canCreate(
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
) {
  const permissions = getRolePermissions(roleRow(auth));
  return (
    permissions.includes("bookings:manage") &&
    permissions.includes("settings:manage")
  );
}

function actorArgs(
  request: Request,
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
) {
  return {
    p_actor_auth_user_id: auth.user?.id,
    p_actor_location_scope: auth.staffProfile?.venue_scope ?? [],
    p_actor_name:
      auth.staffProfile?.full_name ?? auth.user?.email ?? "Staff",
    p_actor_role: getActorRoleLabel(roleRow(auth)?.name),
    p_actor_staff_profile_id: auth.staffProfile?.id,
    p_request_id:
      request.headers.get("x-vercel-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID(),
    p_user_agent: request.headers.get("user-agent"),
  };
}

function bookingReference() {
  return `ZNG-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function safeError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (
    message.includes("BUYOUT_SHOW_HAS_BOOKINGS") ||
    message.includes("BUYOUT_SHOW_ALREADY_OWNED") ||
    message.includes("duplicate key")
  ) {
    return {
      message:
        "This performance already has bookings or a Full Show Buyout. Review it before continuing.",
      status: 409,
    };
  }
  if (message.includes("BUYOUT_EXTRA_TERMS_REQUIRED")) {
    return {
      message:
        "Add the approved extra-guest rate and maximum to the quote before continuing.",
      status: 409,
    };
  }
  if (message.includes("BUYOUT_MAXIMUM_EXCEEDED")) {
    return { message: "The guest count is above the approved quote maximum.", status: 409 };
  }
  if (message.includes("BUYOUT_OPERATIONAL_CAPACITY_EXCEEDED")) {
    return {
      message:
        "This performance does not have enough approved seating for that guest count.",
      status: 409,
    };
  }
  if (message.includes("BUYOUT_CONTACT_NOT_LINKED")) {
    return {
      message: "Select a Contact linked to the chosen Company.",
      status: 409,
    };
  }
  if (
    message.includes("BUYOUT_SHOW_NOT_OPEN") ||
    message.includes("BUYOUT_SHOW_NOT_FOUND")
  ) {
    return { message: "This performance is not available for a Buyout.", status: 409 };
  }
  if (message.includes("BUYOUT_CHANGED")) {
    return { message: "This Buyout changed. Refresh and try again.", status: 409 };
  }
  if (message.includes("BUYOUT_PACKAGE_CHANGED")) {
    return { message: "This package changed. Refresh and review it again.", status: 409 };
  }
  if (message.includes("BUYOUT_ZONE_CAPACITY_EXCEEDED")) {
    return {
      message: "One of the selected sections does not have enough approved seating.",
      status: 409,
    };
  }
  if (message.includes("BUYOUT_RELEASE_PAYMENT_REVIEW_REQUIRED")) {
    return {
      message: "This Buyout has payments. Review the payment details before releasing it.",
      status: 409,
    };
  }
  if (message.includes("BUYOUT_RELEASE_CHECKIN_REVIEW_REQUIRED")) {
    return {
      message: "Guests have already checked in. Review the booking before releasing it.",
      status: 409,
    };
  }

  return { message: "The Full Show Buyout could not be saved.", status: 500 };
}

function canAccessShowVenue(
  venue: string,
  venueScope: string[],
) {
  const location = normalizeShowLocation(venue);
  return Boolean(
    location && (venueScope.includes("all") || venueScope.includes(location)),
  );
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canView(auth)) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
    );
  }

  try {
    const url = new URL(request.url);
    const showId = url.searchParams.get("showId");
    const venueScope = normalizeStaffVenueScope(
      auth.staffProfile.venue_scope ?? [],
    );

    if (showId) {
      const [
        packages,
        companies,
        showResult,
        bookingResult,
        buyoutResult,
      ] = await Promise.all([
        loadCorporateBuyoutPackages(auth.serviceClient),
        loadCompanies(auth.serviceClient, false),
        auth.serviceClient
          .from("shows")
          .select("id,name,date,time,venue,status")
          .eq("id", showId)
          .maybeSingle(),
        auth.serviceClient
          .from("bookings")
          .select("id,guest_count", { count: "exact", head: false })
          .eq("show_id", showId)
          .is("archived_at", null)
          .in("booking_status", [...activeBookingStatuses]),
        auth.serviceClient
          .from("corporate_buyouts")
          .select("id,state")
          .eq("show_id", showId)
          .in("state", [
            "provisional",
            "awaiting_payment",
            "fully_paid",
            "confirmed",
          ])
          .maybeSingle(),
      ]);
      if (showResult.error || bookingResult.error || buyoutResult.error) {
        throw showResult.error ?? bookingResult.error ?? buyoutResult.error;
      }
      const show = showResult.data;
      if (
        !show ||
        !canAccessShowVenue(show.venue, venueScope)
      ) {
        return Response.json(
          { error: "This performance is outside your assigned location." },
          { status: 403 },
        );
      }
      const conflicts = bookingResult.data ?? [];
      const activeBuyout = buyoutResult.data
        ? (
            await loadActiveCorporateBuyoutSummaries(
              auth.serviceClient,
              [show.id],
            )
          ).get(show.id) ?? null
        : null;
      return Response.json({
        canCreate: canCreate(auth),
        companies,
        eligibility: {
          activeBookingCount: conflicts.length,
          activeGuestCount: conflicts.reduce(
            (total, booking) => total + Number(booking.guest_count ?? 0),
            0,
          ),
          available:
            show.status === "active" &&
            conflicts.length === 0 &&
            !buyoutResult.data,
          buyoutState: buyoutResult.data?.state ?? null,
          showStatus: show.status,
        },
        packages,
        shows: [{ ...show, activeBuyout }],
      });
    }

    const [packages, companies, showResult] = await Promise.all([
      loadCorporateBuyoutPackages(auth.serviceClient),
      loadCompanies(auth.serviceClient, false),
      auth.serviceClient
        .from("shows")
        .select("id,name,date,time,venue,status")
        .eq("status", "active")
        .order("date", { ascending: true })
        .order("time", { ascending: true }),
    ]);
    if (showResult.error) throw showResult.error;
    const scopedShows = (showResult.data ?? []).filter((show) =>
      canAccessShowVenue(show.venue, venueScope),
    );
    const summaries = await loadActiveCorporateBuyoutSummaries(
      auth.serviceClient,
      scopedShows.map((show) => show.id),
    );

    return Response.json({
      canCreate: canCreate(auth),
      companies,
      packages,
      shows: scopedShows.map((show) => ({
        ...show,
        activeBuyout: summaries.get(show.id) ?? null,
      })),
    });
  } catch (error) {
    console.error("[Zingara API] Failed to load Full Show Buyouts", error);
    return Response.json(
      { error: "Full Show Buyouts could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
    return auth.error;
  }
  if (!canCreate(auth)) {
    return Response.json(
      {
        error:
          "Booking and show management access is required to create a Full Show Buyout.",
      },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      companyId?: string;
      contactCustomerId?: string;
      expectedGuestCount?: number;
      finalGuestCount?: number | null;
      idempotencyKey?: string;
      packageId?: string;
      showId?: string;
    };
    if (
      !body.showId ||
      !body.companyId ||
      !body.contactCustomerId ||
      !body.packageId ||
      !body.idempotencyKey ||
      !Number.isInteger(body.expectedGuestCount) ||
      Number(body.expectedGuestCount) < 1 ||
      (body.finalGuestCount !== null &&
        body.finalGuestCount !== undefined &&
        (!Number.isInteger(body.finalGuestCount) || body.finalGuestCount < 1))
    ) {
      return Response.json(
        { error: "Choose a performance, Company, Contact, package, and valid guest count." },
        { status: 400 },
      );
    }

    const { data: selectedPackage, error: packageError } =
      await auth.serviceClient
        .from("corporate_buyout_packages")
        .select(
          "id,maximum_guest_count,additional_guest_rate,quote_validity_hours,date_hold_hours,payment_due_hours",
        )
        .eq("id", body.packageId)
        .eq("active", true)
        .maybeSingle();
    if (packageError) throw packageError;
    if (!selectedPackage) {
      return Response.json(
        { error: "This Buyout package is no longer available." },
        { status: 409 },
      );
    }

    const now = Date.now();
    const toDeadline = (hours: number | null) =>
      hours ? new Date(now + hours * 60 * 60 * 1000).toISOString() : null;
    const venueScope = normalizeStaffVenueScope(
      auth.staffProfile.venue_scope ?? [],
    );
    const { data, error } = await auth.serviceClient.rpc(
      "create_corporate_buyout_atomic",
      {
        ...actorArgs(request, auth),
        p_additional_guest_rate: selectedPackage.additional_guest_rate,
        p_authorized_venues: venueScope,
        p_booking_reference: bookingReference(),
        p_company_id: body.companyId,
        p_contact_customer_id: body.contactCustomerId,
        p_expected_guest_count: body.expectedGuestCount,
        p_final_guest_count: body.finalGuestCount ?? null,
        p_hold_until: toDeadline(selectedPackage.date_hold_hours),
        p_idempotency_key: body.idempotencyKey,
        p_maximum_guest_count: selectedPackage.maximum_guest_count,
        p_package_id: body.packageId,
        p_payment_due_at: toDeadline(selectedPackage.payment_due_hours),
        p_quote_valid_until: toDeadline(selectedPackage.quote_validity_hours),
        p_show_id: body.showId,
        p_terms_snapshot: {
          additionalGuestRate: selectedPackage.additional_guest_rate,
          dateHoldHours: selectedPackage.date_hold_hours,
          maximumGuestCount: selectedPackage.maximum_guest_count,
          paymentDueHours: selectedPackage.payment_due_hours,
          quoteValidityHours: selectedPackage.quote_validity_hours,
        },
      },
    );
    if (error) throw error;
    return Response.json({ buyout: data });
  } catch (error) {
    const safe = safeError(error);
    if (safe.status === 500) {
      console.error("[Zingara API] Full Show Buyout creation failed", error);
    }
    return Response.json({ error: safe.message }, { status: safe.status });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
    return auth.error;
  }
  if (!canCreate(auth)) {
    return Response.json(
      { error: "Booking and show management access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "allocate-zones" | "issue-tickets" | "release";
      buyoutId?: string;
      expectedRevision?: number;
      reason?: string;
      ticketEntitlementCount?: number;
      zoneAllocations?: Array<{ pax: number; zoneId: string }>;
    };
    if (!body.buyoutId || !Number.isInteger(body.expectedRevision)) {
      return Response.json(
        { error: "Open the current Buyout and try again." },
        { status: 400 },
      );
    }

    const { data: buyout, error: buyoutError } = await auth.serviceClient
      .from("corporate_buyouts")
      .select("show_id")
      .eq("id", body.buyoutId)
      .maybeSingle();
    if (buyoutError) throw buyoutError;
    if (!buyout) {
      return Response.json({ error: "This Full Show Buyout could not be found." }, { status: 404 });
    }
    const { data: show, error: showError } = await auth.serviceClient
      .from("shows")
      .select("venue")
      .eq("id", buyout.show_id)
      .maybeSingle();
    if (showError) throw showError;
    const venueScope = normalizeStaffVenueScope(
      auth.staffProfile.venue_scope ?? [],
    );
    if (!show || !canAccessShowVenue(show.venue, venueScope)) {
      return Response.json(
        { error: "This performance is outside your assigned location." },
        { status: 403 },
      );
    }

    const common = {
      ...actorArgs(request, auth),
      p_buyout_id: body.buyoutId,
      p_expected_revision: body.expectedRevision,
    };
    const operation =
      body.action === "allocate-zones"
        ? auth.serviceClient.rpc(
            "update_corporate_buyout_allocation_atomic",
            {
              ...common,
              p_zone_allocations: body.zoneAllocations ?? [],
            },
          )
        : body.action === "issue-tickets" &&
            Number.isInteger(body.ticketEntitlementCount)
          ? auth.serviceClient.rpc(
              "issue_corporate_buyout_tickets_atomic",
              {
                ...common,
                p_ticket_entitlement_count: body.ticketEntitlementCount,
              },
            )
          : body.action === "release" && body.reason?.trim()
            ? auth.serviceClient.rpc("release_corporate_buyout_atomic", {
                ...common,
                p_reason: body.reason.trim(),
              })
            : null;
    if (!operation) {
      return Response.json({ error: "Choose a valid Buyout action." }, { status: 400 });
    }
    const { data, error } = await operation;
    if (error) throw error;
    return Response.json({ result: data });
  } catch (error) {
    const safe = safeError(error);
    if (safe.status === 500) {
      console.error("[Zingara API] Full Show Buyout update failed", error);
    }
    return Response.json({ error: safe.message }, { status: safe.status });
  }
}
