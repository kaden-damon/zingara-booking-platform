import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function allowedVenues(scope: string[]) {
  const normalized = normalizeStaffVenueScope(scope ?? []);
  if (normalized.includes("all")) return ["cape-town", "johannesburg"];
  return normalized.filter((venue) => venue === "cape-town" || venue === "johannesburg");
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("communications:manage")) {
    return Response.json({ error: "Communications management access is required." }, { status: 403 });
  }
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(10, Number(url.searchParams.get("pageSize") || 10)));
  const from = (page - 1) * pageSize;
  const venue = url.searchParams.get("venue") || "all";
  const rating = url.searchParams.get("rating") || "all";
  const device = url.searchParams.get("device") || "all";
  const showDateDifficulty = url.searchParams.get("showDateDifficulty") || "all";
  const seatingDifficulty = url.searchParams.get("seatingDifficulty") || "all";
  const checkoutDifficulty = url.searchParams.get("checkoutDifficulty") || "all";
  const paymentConfidence = url.searchParams.get("paymentConfidence") || "all";
  const contactRequest = url.searchParams.get("contactRequest") || "all";
  const contacted = url.searchParams.get("contacted") || "all";
  const reply = url.searchParams.get("reply") || "all";
  const status = url.searchParams.get("status") || "all";
  const feedbackId = url.searchParams.get("feedbackId") || "";
  const includeDetails = Boolean(feedbackId) && url.searchParams.get("details") === "true";
  const venues = allowedVenues(auth.staffProfile.venue_scope);
  if (venue !== "all" && !venues.includes(venue)) {
    return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
  }
  try {
    let query = auth.serviceClient
      .from("platform_feedback_submissions")
      .select("id,booking_id,customer_id,show_id,venue,rating,show_date_ease,seating_ease,checkout_ease,comment,payment_confidence,booking_device,contact_requested,device_category,contacted_at,contacted_by,contact_method,replied_at,replied_by_name,status,revision,submitted_at", { count: "exact" })
      .in("venue", venue === "all" ? venues : [venue])
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (feedbackId) query = query.eq("id", feedbackId);
    if (rating !== "all") query = query.eq("rating", Number(rating));
    if (device !== "all") query = query.eq("booking_device", device);
    if (showDateDifficulty === "difficult") query = query.lte("show_date_ease", 2);
    if (showDateDifficulty === "neutral") query = query.eq("show_date_ease", 3);
    if (showDateDifficulty === "easy") query = query.gte("show_date_ease", 4);
    if (seatingDifficulty === "difficult") query = query.lte("seating_ease", 2);
    if (seatingDifficulty === "neutral") query = query.eq("seating_ease", 3);
    if (seatingDifficulty === "easy") query = query.gte("seating_ease", 4);
    if (checkoutDifficulty === "difficult") query = query.lte("checkout_ease", 2);
    if (checkoutDifficulty === "neutral") query = query.eq("checkout_ease", 3);
    if (checkoutDifficulty === "easy") query = query.gte("checkout_ease", 4);
    if (paymentConfidence !== "all") query = query.eq("payment_confidence", paymentConfidence);
    if (status !== "all") query = query.eq("status", status);
    if (contactRequest === "requested") query = query.eq("contact_requested", true);
    if (contactRequest === "not_requested") query = query.eq("contact_requested", false);
    if (contacted === "contacted") query = query.not("contacted_at", "is", null);
    if (contacted === "not_contacted") query = query.is("contacted_at", null);
    if (reply === "replied") query = query.not("replied_at", "is", null);
    if (reply === "not_replied") query = query.is("replied_at", null);
    const { data, error, count } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const bookingIds = [...new Set(rows.map((row) => row.booking_id))];
    const customerIds = [...new Set(rows.map((row) => row.customer_id))];
    const showIds = [...new Set(rows.map((row) => row.show_id))];
    const staffIds = [...new Set(rows.map((row) => row.contacted_by).filter(Boolean))] as string[];
    const [bookings, customers, shows, staff] = await Promise.all([
      bookingIds.length ? auth.serviceClient.from("bookings").select("id,booking_reference").in("id", bookingIds) : Promise.resolve({ data: [], error: null }),
      customerIds.length ? auth.serviceClient.from("customers").select("id,first_name,surname").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
      showIds.length ? auth.serviceClient.from("shows").select("id,name,date,time,venue").in("id", showIds) : Promise.resolve({ data: [], error: null }),
      staffIds.length ? auth.serviceClient.from("staff_profiles").select("id,full_name").in("id", staffIds) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [bookings, customers, shows, staff]) if (result.error) throw result.error;
    const bookingMap = new Map((bookings.data ?? []).map((row) => [row.id, row]));
    const customerMap = new Map((customers.data ?? []).map((row) => [row.id, row]));
    const showMap = new Map((shows.data ?? []).map((row) => [row.id, row]));
    const staffMap = new Map((staff.data ?? []).map((row) => [row.id, row.full_name]));
    let events: Array<Record<string, unknown>> = [];
    let replies: Array<Record<string, unknown>> = [];
    let selectedContact: { email: string | null; mobile: string | null } | null = null;
    if (feedbackId && rows.length) {
      const [eventResult, replyResult, contactResult] = await Promise.all([
        auth.serviceClient.from("platform_feedback_events").select("id,feedback_id,event_type,actor_staff_profile_id,occurred_at,note").eq("feedback_id", feedbackId).order("occurred_at", { ascending: false }),
        auth.serviceClient.from("platform_feedback_replies").select("id,feedback_id,actor_name,actor_email,message,sent_at").eq("feedback_id", feedbackId).eq("status", "sent").order("sent_at", { ascending: false }),
        includeDetails
          ? auth.serviceClient.from("customers").select("email,mobile").eq("id", rows[0].customer_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (eventResult.error || replyResult.error || contactResult.error) throw eventResult.error || replyResult.error || contactResult.error;
      events = eventResult.data ?? [];
      replies = replyResult.data ?? [];
      selectedContact = contactResult.data ?? null;
    }
    return Response.json({
      page,
      pageSize,
      total: count ?? 0,
      rows: rows.map((row) => {
        const customer = customerMap.get(row.customer_id);
        const show = showMap.get(row.show_id);
        return {
          bookingReference: bookingMap.get(row.booking_id)?.booking_reference ?? "Booking unavailable",
          comment: row.comment,
          contact: includeDetails ? selectedContact : null,
          contactedAt: row.contacted_at,
          contactedBy: row.contacted_by ? staffMap.get(row.contacted_by) ?? "Staff member" : null,
          contactMethod: row.contact_method,
          contactRequested: row.contact_requested,
          bookingDevice: row.booking_device,
          checkoutEase: row.checkout_ease,
          deviceCategory: row.device_category,
          displayName: customer ? [customer.first_name, customer.surname].filter(Boolean).join(" ") : "Guest",
          history: events.filter((event) => event.feedback_id === row.id),
          id: row.id,
          performanceDate: show?.date ?? null,
          performanceName: show?.name ?? "Performance unavailable",
          performanceTime: show?.time?.slice(0, 5) ?? null,
          paymentConfidence: row.payment_confidence,
          rating: row.rating,
          repliedAt: row.replied_at,
          repliedBy: row.replied_by_name,
          replies: replies.filter((reply) => reply.feedback_id === row.id),
          revision: row.revision,
          seatingEase: row.seating_ease,
          showDateEase: row.show_date_ease,
          status: row.status,
          submittedAt: row.submitted_at,
          venue: row.venue,
        };
      }),
    });
  } catch (error) {
    console.error("[Platform Feedback] Admin queue failed", error);
    return Response.json({ error: "Platform feedback could not be loaded." }, { status: 500 });
  }
}
