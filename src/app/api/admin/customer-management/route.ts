import { getActorRoleLabel } from "@/lib/auditTrail";
import {
  getRolePermissions,
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { normalizePhoneForComparison, parseInternationalPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const customerFields = "id,first_name,surname,email,mobile,company_id,job_title,crm_revision,preferences,vip_status,relationship_notes,dietary_requirements,created_at,updated_at";
const customerListFields = "id,first_name,surname,crm_revision,preferences,updated_at";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canManage(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile?.roles;
  return getRolePermissions(role).includes("bookings:manage");
}

function canRead(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile?.roles;
  const permissions = getRolePermissions(role);
  return permissions.includes("crm:read") || permissions.includes("bookings:manage");
}

function canManageCommunications(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile?.roles;
  const permissions = getRolePermissions(role);
  return permissions.includes("crm:read") && permissions.includes("communications:manage");
}

function actorArgs(
  request: Request,
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile?.roles;
  return {
    p_actor_auth_user_id: auth.user?.id,
    p_actor_location_scope: auth.staffProfile?.venue_scope ?? [],
    p_actor_name: auth.staffProfile?.full_name ?? auth.user?.email ?? "Staff",
    p_actor_role: getActorRoleLabel(role?.name),
    p_actor_staff_profile_id: auth.staffProfile?.id,
    p_request_id:
      request.headers.get("x-vercel-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID(),
    p_user_agent: request.headers.get("user-agent"),
  };
}

function cleanSearch(value: string) {
  return value.replace(/[,%()]/g, " ").trim().slice(0, 120);
}

function getPagination(url: URL, defaultPageSize = 10) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(25, Math.max(1, Number(url.searchParams.get("pageSize") ?? defaultPageSize)));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

function parseBookingMetadata(notes: unknown) {
  const prefix = "__zingara_booking_meta__:";
  if (typeof notes !== "string" || !notes.startsWith(prefix)) return null;
  try {
    return JSON.parse(notes.slice(prefix.length)) as {
      addons?: Array<{ id?: string; name?: string; price?: number; quantity?: number }>;
      customer?: { email?: string; name?: string; phone?: string };
    };
  } catch {
    return null;
  }
}

async function loadCustomerSummaryBookings(
  client: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  customerId: string,
) {
  const batchSize = 500;
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await client
      .from("bookings")
      .select("id,booking_status,guest_count,total_amount,amount_paid,balance_outstanding,section,addons_total,notes")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .range(from, from + batchSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Array<Record<string, unknown>>));
    if ((data?.length ?? 0) < batchSize) break;
    if (rows.length >= 10_000) throw new Error("Customer booking history exceeds the supported summary boundary.");
  }
  return rows;
}

async function loadPromoRedemptions(
  client: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  bookingIds: string[],
) {
  const rows: Array<{ booking_id: string; discount_amount: number; promo_code: unknown }> = [];
  for (let index = 0; index < bookingIds.length; index += 200) {
    const { data, error } = await client
      .from("promo_redemptions")
      .select("booking_id,discount_amount,promo_code:promo_codes(code)")
      .in("booking_id", bookingIds.slice(index, index + 200));
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ booking_id: string; discount_amount: number; promo_code: unknown }>));
  }
  return rows;
}

function normalizeIdentity(input: {
  email?: string;
  firstName?: string;
  mobile?: string;
  surname?: string;
}) {
  const firstName = input.firstName?.trim() ?? "";
  const surname = input.surname?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const rawMobile = input.mobile?.trim() ?? "";
  const parsedMobile = rawMobile ? parseInternationalPhone(rawMobile) : null;

  if (!firstName || !surname) return { error: "First name and surname are required." };
  if (email && !emailPattern.test(email)) return { error: "Enter a valid email address." };
  if (rawMobile && !parsedMobile?.valid) return { error: "Enter a valid mobile number." };

  return {
    payload: {
      email: email || null,
      first_name: firstName,
      mobile: parsedMobile?.valid ? parsedMobile.e164 : null,
      surname,
    },
  };
}

async function findPotentialMatches(
  client: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  identity: { email: string | null; first_name: string; mobile: string | null; surname: string },
) {
  const clauses = [
    `and(first_name.ilike.${identity.first_name},surname.ilike.${identity.surname})`,
    identity.email ? `email.eq.${identity.email}` : "",
    identity.mobile ? `mobile.eq.${identity.mobile}` : "",
  ].filter(Boolean);
  const { data, error } = await client
    .from("customers")
    .select(customerFields)
    .is("merged_into_customer_id", null)
    .or(clauses.join(","))
    .order("updated_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  return data ?? [];
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canRead(auth)) return Response.json({ error: "Customer access is required." }, { status: 403 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "list";

  try {
    if (mode === "suggestions") {
      const normalized = normalizeIdentity({
        email: url.searchParams.get("email") ?? "",
        firstName: url.searchParams.get("firstName") ?? "",
        mobile: url.searchParams.get("mobile") ?? "",
        surname: url.searchParams.get("surname") ?? "",
      });
      if (!normalized.payload) return Response.json({ matches: [] });
      const matches = await findPotentialMatches(auth.serviceClient, normalized.payload);
      return Response.json({ matches });
    }

    if (mode === "companies") {
      const search = cleanSearch(url.searchParams.get("search") ?? "");
      let query = auth.serviceClient
        .from("companies")
        .select("id,legal_name,trading_name", { count: "exact" })
        .is("archived_at", null)
        .is("merged_into_company_id", null)
        .order("legal_name")
        .limit(20);
      if (search) query = query.or(`legal_name.ilike.%${search}%,trading_name.ilike.%${search}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return Response.json({ companies: data ?? [], total: count ?? 0 });
    }

    if (mode === "detail") {
      const id = url.searchParams.get("id") ?? "";
      if (!uuidPattern.test(id)) {
        return Response.json({ error: "Customer could not be found." }, { status: 404 });
      }
      const { data: customer, error } = await auth.serviceClient
        .from("customers")
        .select(customerFields)
        .eq("id", id)
        .is("merged_into_customer_id", null)
        .maybeSingle();
      if (error) throw error;
      if (!customer) return Response.json({ error: "Customer could not be found." }, { status: 404 });

      const linksResult = await auth.serviceClient
          .from("customer_company_associations")
          .select("id,company_id,job_title,created_at")
          .eq("customer_id", id)
          .is("removed_at", null)
          .order("created_at");
      if (linksResult.error) throw linksResult.error;

      const companyIds = [...new Set((linksResult.data ?? []).map((link) => link.company_id))];
      const companiesResult = companyIds.length
        ? await auth.serviceClient.from("companies").select("id,legal_name,trading_name").in("id", companyIds)
        : { data: [], error: null };
      if (companiesResult.error) throw companiesResult.error;
      const companies = new Map((companiesResult.data ?? []).map((company) => [company.id, company]));

      return Response.json({
        canArchive: isSuperAdminProfile(auth.staffProfile),
        canManageCommunications: canManageCommunications(auth),
        customer,
        links: (linksResult.data ?? []).map((link) => ({ ...link, company: companies.get(link.company_id) ?? null })),
      });
    }

    if (mode === "summary") {
      const id = url.searchParams.get("id") ?? "";
      if (!uuidPattern.test(id)) return Response.json({ error: "Customer could not be found." }, { status: 404 });
      const bookings = await loadCustomerSummaryBookings(auth.serviceClient, id);
      const activeBookings = bookings.filter((booking) => String(booking.booking_status) !== "cancelled");
      const bookingIds = bookings.map((booking) => String(booking.id));
      const promoRedemptions = await loadPromoRedemptions(auth.serviceClient, bookingIds);

      const zoneCounts = new Map<string, number>();
      const addons = new Map<string, { count: number; name: string; revenue: number }>();
      for (const booking of activeBookings) {
        const section = String(booking.section ?? "").trim();
        if (section) zoneCounts.set(section, (zoneCounts.get(section) ?? 0) + 1);
        for (const addon of parseBookingMetadata(booking.notes)?.addons ?? []) {
          const name = String(addon.name ?? "Add-on").trim() || "Add-on";
          const key = String(addon.id ?? name);
          const current = addons.get(key) ?? { count: 0, name, revenue: 0 };
          addons.set(key, {
            count: current.count + 1,
            name,
            revenue: current.revenue + Number(addon.price ?? 0),
          });
        }
      }
      const promos = new Map<string, { code: string; count: number; discount: number }>();
      for (const redemption of promoRedemptions) {
        const relation = redemption.promo_code as unknown;
        const promo = Array.isArray(relation) ? relation[0] : relation;
        const code = String((promo as { code?: string } | null)?.code ?? "Promotion");
        const current = promos.get(code) ?? { code, count: 0, discount: 0 };
        promos.set(code, {
          code,
          count: current.count + 1,
          discount: current.discount + Number(redemption.discount_amount ?? 0),
        });
      }
      const attendanceCount = activeBookings.filter((booking) => {
        const status = String(booking.booking_status);
        return status === "checked_in" || status === "checked-in";
      }).length;
      const favouriteZone = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return Response.json({
        summary: {
          activeBookings: activeBookings.length,
          addOns: [...addons.values()].sort((a, b) => b.count - a.count),
          attendanceCount,
          attendanceRate: activeBookings.length ? Math.round((attendanceCount / activeBookings.length) * 100) : 0,
          favouriteZone,
          guestEntitlement: activeBookings.reduce((sum, booking) => sum + Number(booking.guest_count ?? 0), 0),
          outstanding: activeBookings.reduce((sum, booking) => sum + Number(booking.balance_outstanding ?? 0), 0),
          paid: activeBookings.reduce((sum, booking) => sum + Number(booking.amount_paid ?? 0), 0),
          promoUsage: [...promos.values()].sort((a, b) => b.count - a.count),
          totalBookings: bookings.length,
          totalSpend: activeBookings.reduce((sum, booking) => sum + Number(booking.total_amount ?? 0), 0),
        },
      });
    }

    if (mode === "history") {
      const id = url.searchParams.get("id") ?? "";
      if (!uuidPattern.test(id)) {
        return Response.json({ error: "Customer could not be found." }, { status: 404 });
      }
      const { page, pageSize, from, to } = getPagination(url);
      const bookingsResult = await auth.serviceClient
        .from("bookings")
        .select("id,booking_reference,booking_status,payment_status,guest_count,total_amount,amount_paid,balance_outstanding,show_id,company_id,section,table_id,notes,created_at", { count: "exact" })
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      const errors: string[] = [];
      if (bookingsResult.error) {
        console.error("[Zingara API] Customer booking history failed", bookingsResult.error);
        errors.push("Booking history could not be loaded.");
      }
      const bookings = bookingsResult.error ? [] : bookingsResult.data ?? [];
      const showIds = [...new Set(bookings.map((booking) => booking.show_id).filter(Boolean))];
      const bookingIds = bookings.map((booking) => booking.id);
      const [showsResult, tableResult] = await Promise.all([
        showIds.length
          ? auth.serviceClient.from("shows").select("id,name,date,time,venue,status").in("id", showIds)
          : Promise.resolve({ data: [], error: null }),
        bookingIds.length
          ? auth.serviceClient.from("show_tables").select("booking_id,table_code,section").in("booking_id", bookingIds).order("table_code")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (showsResult.error) {
        console.error("[Zingara API] Customer booking shows failed", showsResult.error);
        errors.push("Performance details could not be loaded.");
      }
      if (tableResult.error) {
        console.error("[Zingara API] Customer booking tables failed", tableResult.error);
        errors.push("Table details could not be loaded.");
      }
      const shows = new Map((showsResult.data ?? []).map((show) => [show.id, show]));
      const tablesByBooking = new Map<string, string[]>();
      for (const table of tableResult.data ?? []) {
        const current = tablesByBooking.get(table.booking_id) ?? [];
        current.push(table.table_code);
        tablesByBooking.set(table.booking_id, current);
      }

      return Response.json({
        bookings: bookings.map((booking) => ({
          ...booking,
          customer_snapshot: parseBookingMetadata(booking.notes)?.customer ?? null,
          notes: undefined,
          show: shows.get(booking.show_id) ?? null,
          table_codes: tablesByBooking.get(booking.id) ?? [],
        })),
        errors,
        page,
        pageSize,
        total: bookingsResult.count ?? 0,
      });
    }

    if (mode === "communications") {
      const id = url.searchParams.get("id") ?? "";
      if (!uuidPattern.test(id)) return Response.json({ error: "Customer could not be found." }, { status: 404 });
      const { page, pageSize, from, to } = getPagination(url);
      const { data, error, count } = await auth.serviceClient
        .from("communications")
        .select("id,booking_id,type,channel,subject,message,status,sent_at,created_at", { count: "exact" })
        .eq("customer_id", id)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      const bookingIds = [...new Set((data ?? []).map((row) => row.booking_id).filter(Boolean))];
      const refsResult = bookingIds.length
        ? await auth.serviceClient.from("bookings").select("id,booking_reference").in("id", bookingIds)
        : { data: [], error: null };
      if (refsResult.error) throw refsResult.error;
      const refs = new Map((refsResult.data ?? []).map((row) => [row.id, row.booking_reference]));
      return Response.json({
        page,
        pageSize,
        rows: (data ?? []).map((row) => ({ ...row, booking_reference: refs.get(row.booking_id) ?? null })),
        total: count ?? 0,
      });
    }

    if (mode === "activity") {
      const id = url.searchParams.get("id") ?? "";
      if (!uuidPattern.test(id)) return Response.json({ error: "Customer could not be found." }, { status: 404 });
      const { page, pageSize, from, to } = getPagination(url);
      const { data, error, count } = await auth.serviceClient
        .from("audit_events")
        .select("id,action,actor_name,created_at,changed_fields", { count: "exact" })
        .eq("entity_type", "customer")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return Response.json({ page, pageSize, rows: data ?? [], total: count ?? 0 });
    }

    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? 10)));
    const search = cleanSearch(url.searchParams.get("search") ?? "");
    const archived = url.searchParams.get("archived") ?? "active";
    let query = auth.serviceClient
      .from("customers")
      .select(customerListFields, { count: "exact" })
      .is("merged_into_customer_id", null)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (archived === "active") query = query.is("preferences->>archivedAt", null);
    if (archived === "archived") query = query.not("preferences->>archivedAt", "is", null);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,surname.ilike.%${search}%,email.ilike.%${search}%,mobile.ilike.%${search}%`);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    return Response.json({ canManage: canManage(auth), page, pageSize, rows: data ?? [], total: count ?? 0 });
  } catch (error) {
    console.error("[Zingara API] Customer management read failed", error);
    return Response.json({ error: "Customer information could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Customer management access is required." }, { status: 403 });

  try {
    const body = (await request.json()) as {
      action?: "create" | "link";
      companyId?: string;
      customerId?: string;
      email?: string;
      firstName?: string;
      forceCreate?: boolean;
      jobTitle?: string;
      mobile?: string;
      surname?: string;
    };
    if (body.action === "link") {
      if (!body.customerId || !body.companyId) return Response.json({ error: "Customer and Company are required." }, { status: 400 });
      const { data, error } = await auth.serviceClient.rpc("link_customer_company_association_atomic", {
        ...actorArgs(request, auth),
        p_company_id: body.companyId,
        p_customer_id: body.customerId,
        p_job_title: body.jobTitle ?? "",
      });
      if (error) throw error;
      return Response.json({ association: data });
    }

    const normalized = normalizeIdentity(body);
    if (!normalized.payload) return Response.json({ error: normalized.error }, { status: 400 });
    const matches = await findPotentialMatches(auth.serviceClient, normalized.payload);
    if (matches.length > 0 && !body.forceCreate) {
      return Response.json({ code: "POTENTIAL_MATCHES", matches }, { status: 409 });
    }

    const customerKey =
      normalized.payload.email ??
      normalizePhoneForComparison(normalized.payload.mobile) ??
      `${normalized.payload.first_name} ${normalized.payload.surname}`.toLowerCase();
    const { data, error } = await auth.serviceClient.rpc(
      "create_customer_profile_atomic",
      {
        ...actorArgs(request, auth),
        p_customer_key: customerKey,
        p_email: normalized.payload.email ?? "",
        p_first_name: normalized.payload.first_name,
        p_mobile: normalized.payload.mobile ?? "",
        p_surname: normalized.payload.surname,
      },
    );
    if (error) {
      if (error.code === "23505") return Response.json({ error: "A customer with those contact details already exists." }, { status: 409 });
      throw error;
    }
    return Response.json({ customer: data }, { status: 201 });
  } catch (error) {
    console.error("[Zingara API] Customer management write failed", error);
    return Response.json({ error: "The customer could not be saved." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!canManage(auth)) return Response.json({ error: "Customer management access is required." }, { status: 403 });
  try {
    const body = (await request.json()) as { companyId?: string; customerId?: string };
    if (!body.customerId || !body.companyId) return Response.json({ error: "Customer and Company are required." }, { status: 400 });
    const { data, error } = await auth.serviceClient.rpc("unlink_customer_company_association_atomic", {
      ...actorArgs(request, auth),
      p_company_id: body.companyId,
      p_customer_id: body.customerId,
    });
    if (error) throw error;
    return Response.json({ result: data });
  } catch (error) {
    console.error("[Zingara API] Customer Company unlink failed", error);
    return Response.json({ error: "The Company association could not be removed." }, { status: 500 });
  }
}
