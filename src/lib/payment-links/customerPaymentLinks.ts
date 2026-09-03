import crypto from "crypto";
import {
  createExistingBookingPayFastCheckout,
} from "@/lib/payfast/checkout";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoBooking } from "@/lib/zingaraDemo";
import {
  calculateOutstandingAmount,
  isPaymentLinkEligible,
} from "@/lib/paymentControls";

export const bookingMetadataPrefix = "__zingara_booking_meta__:";

export type PaymentLinkBookingRow = {
  amount_paid: number | null;
  archived_at: string | null;
  balance_outstanding: number | null;
  booking_reference: string;
  booking_source: string | null;
  booking_status: string;
  customer_id: string;
  id: string;
  notes: string | null;
  payment_status: string;
  section: string | null;
  show_id: string;
  total_amount: number | null;
};

export type PaymentLinkCustomerRow = {
  email: string | null;
  first_name: string | null;
  mobile: string | null;
  surname: string | null;
};

export type PaymentLinkShowRow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string | null;
};

export type PaymentLinkRecordRow = {
  booking_id: string;
  booking_reference: string;
  created_at: string;
  created_by: string | null;
  expires_at: string;
  id: string;
  metadata: Record<string, unknown> | null;
  revoked_at: string | null;
  sent_at: string | null;
  status: "active" | "expired" | "revoked" | "used";
  token_hash: string;
  used_at: string | null;
};

export type ManagedPaymentLinkStatus =
  | "active"
  | "expired"
  | "paid"
  | "revoked";

export type PaymentLinkCheckoutResult =
  | {
      actionUrl: string;
      fields: Record<string, boolean | number | string | null | undefined>;
      mode: "live" | "sandbox";
      status: "payfast";
    }
  | {
      bookingReference: string;
      status: "zero_value";
    }
  | {
      bookingReference: string;
      status: "already_paid";
    };

export function parseBookingMetadata(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) {
    return null;
  }

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as DemoBooking;
  } catch {
    return null;
  }
}

export function hashPaymentLinkToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createPaymentLinkToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function getPaymentLinkUrl(request: Request, token: string) {
  const url = new URL(request.url);

  return `${url.origin}/payment/${encodeURIComponent(token)}`;
}

export function getOutstandingAmount(row: PaymentLinkBookingRow) {
  return calculateOutstandingAmount(
    row.total_amount,
    row.amount_paid,
  );
}

export function getSelectedBookingPaymentAmount(row: PaymentLinkBookingRow) {
  const outstandingAmount = getOutstandingAmount(row);
  const booking = parseBookingMetadata(row.notes);

  if (booking?.paymentOption !== "deposit") {
    return outstandingAmount;
  }

  const depositPercentage = Number(booking.depositPercentage);

  if (!Number.isFinite(depositPercentage) || depositPercentage <= 0) {
    return outstandingAmount;
  }

  return Math.min(
    outstandingAmount,
    Math.max(
      Math.round(
        Math.max(Number(row.total_amount) || 0, 0) *
          (depositPercentage / 100),
      ),
      0,
    ),
  );
}

export function getPaymentLinkCheckoutAmount(
  link: Pick<PaymentLinkRecordRow, "metadata">,
  booking: PaymentLinkBookingRow,
) {
  const outstandingAmount = getOutstandingAmount(booking);
  const configuredAmount = Number(link.metadata?.checkoutAmount);

  if (!Number.isFinite(configuredAmount) || configuredAmount <= 0) {
    return outstandingAmount;
  }

  return Math.min(configuredAmount, outstandingAmount);
}

export function isBookingPaymentLinkEligible(row: PaymentLinkBookingRow) {
  return isPaymentLinkEligible({
    archived: Boolean(row.archived_at),
    bookingStatus: row.booking_status,
    confirmedPaidAmount: row.amount_paid,
    paymentStatus: row.payment_status,
    totalAmount: row.total_amount,
  });
}

export function getCustomerName(customer: PaymentLinkCustomerRow | null) {
  return [customer?.first_name, customer?.surname]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export async function loadBookingForPaymentLink(
  supabase: SupabaseClient,
  bookingReference: string,
) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,customer_id,show_id,booking_reference,booking_source,booking_status,payment_status,total_amount,amount_paid,balance_outstanding,section,notes,archived_at",
    )
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PaymentLinkBookingRow | null;
}

export async function loadCustomerForPaymentLink(
  supabase: SupabaseClient,
  customerId: string,
) {
  const { data, error } = await supabase
    .from("customers")
    .select("first_name,surname,email,mobile")
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PaymentLinkCustomerRow | null;
}

export async function loadShowForPaymentLink(
  supabase: SupabaseClient,
  showId: string,
) {
  const { data, error } = await supabase
    .from("shows")
    .select("id,name,date,time,venue")
    .eq("id", showId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PaymentLinkShowRow | null;
}

export async function loadActivePaymentLink(
  supabase: SupabaseClient,
  token: string,
) {
  const tokenHash = hashPaymentLinkToken(token.trim());
  const { data, error } = await supabase
    .from("booking_payment_links")
    .select("id,booking_id,booking_reference,status,expires_at,metadata")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PaymentLinkRecordRow | null;
}

export async function loadPaymentLinkById(
  supabase: SupabaseClient,
  linkId: string,
) {
  const { data, error } = await supabase
    .from("booking_payment_links")
    .select(
      "id,booking_id,booking_reference,status,expires_at,metadata,created_at,created_by,sent_at,used_at,revoked_at,token_hash",
    )
    .eq("id", linkId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PaymentLinkRecordRow | null;
}

export async function loadLatestPaymentLinkForBooking(
  supabase: SupabaseClient,
  bookingId: string,
) {
  const { data, error } = await supabase
    .from("booking_payment_links")
    .select(
      "id,booking_id,booking_reference,status,expires_at,metadata,created_at,created_by,sent_at,used_at,revoked_at,token_hash",
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PaymentLinkRecordRow | null;
}

export function getManagedPaymentLinkStatus(
  link: Pick<PaymentLinkRecordRow, "expires_at" | "status">,
  booking: PaymentLinkBookingRow,
  now = new Date(),
): ManagedPaymentLinkStatus {
  if (link.status === "used" || getOutstandingAmount(booking) <= 0) {
    return "paid";
  }

  if (link.status === "revoked") {
    return "revoked";
  }

  if (
    link.status === "expired" ||
    new Date(link.expires_at).getTime() <= now.getTime()
  ) {
    return "expired";
  }

  return "active";
}

export async function expirePaymentLink(
  supabase: SupabaseClient,
  linkId: string,
) {
  await supabase
    .from("booking_payment_links")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("id", linkId)
    .eq("status", "active");
}

export async function createPayFastCheckoutForBookingLink(
  supabase: SupabaseClient,
  row: PaymentLinkBookingRow,
  customer: PaymentLinkCustomerRow | null,
  preparedAmount: number,
): Promise<PaymentLinkCheckoutResult> {
  const outstandingAmount = getOutstandingAmount(row);

  if (outstandingAmount <= 0 || row.payment_status === "fully_paid") {
    return row.payment_status === "pending_payment"
      ? {
          bookingReference: row.booking_reference,
          status: "zero_value",
        }
      : {
          bookingReference: row.booking_reference,
          status: "already_paid",
        };
  }

  const booking = parseBookingMetadata(row.notes);
  const checkout = await createExistingBookingPayFastCheckout(supabase, {
    amount: outstandingAmount,
    preparedAmount,
    bookingReference: row.booking_reference,
    customer: {
      email: customer?.email ?? booking?.customer.email,
      name: getCustomerName(customer) || booking?.customer.name,
      phone: customer?.mobile ?? booking?.customer.phone,
    },
    itemDescription: `Zingara booking payment ${row.booking_reference}`,
    itemName: "The Royal Countess Zingara Booking",
    section: row.section ?? booking?.zoneTitle,
  });

  if ("error" in checkout) {
    throw Object.assign(new Error(checkout.error), {
      status: checkout.status,
    });
  }

  return {
    actionUrl: checkout.actionUrl,
    fields: checkout.fields,
    mode: checkout.mode,
    status: "payfast",
  };
}
