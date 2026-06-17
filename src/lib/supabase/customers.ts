import {
  type CustomerInfo,
  type DemoCustomerCrmRecord,
  getStoredDemoCustomerCrm,
  storeDemoCustomerCrm,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";

type CustomerPreferences = {
  customerKey?: string;
  vipTags?: string[];
};

type SupabaseCustomerRow = {
  created_at?: string;
  dietary_requirements: string | null;
  email: string | null;
  first_name: string;
  id: string;
  mobile: string | null;
  preferences: CustomerPreferences | null;
  relationship_notes: string | null;
  surname: string | null;
  updated_at?: string;
  vip_status: string | null;
};

type CustomerWriteInput = {
  customerKey?: string;
  dietaryRequirements?: string;
  email?: string;
  mobile?: string;
  name?: string;
  relationshipNotes?: string;
  vipTags?: string[];
};

function getCustomerKey(customer: {
  email?: string;
  name?: string;
  phone?: string;
}) {
  const email = customer.email?.trim().toLowerCase();
  const phone = customer.phone?.replace(/\D/g, "");
  const name = customer.name?.trim().toLowerCase();

  return email || phone || name || "unknown-customer";
}

function splitCustomerName(name: string | undefined, fallbackKey: string) {
  const trimmedName = name?.trim() || fallbackKey;
  const [firstName = trimmedName, ...surnameParts] = trimmedName.split(/\s+/);

  return {
    firstName,
    surname: surnameParts.join(" ") || null,
  };
}

function toCrmRecord(row: SupabaseCustomerRow): DemoCustomerCrmRecord {
  const vipTags = Array.isArray(row.preferences?.vipTags)
    ? row.preferences.vipTags
    : row.vip_status
    ? [row.vip_status]
    : [];
  const customerKey =
    row.preferences?.customerKey ??
    row.email ??
    row.mobile?.replace(/\D/g, "") ??
    `${row.first_name} ${row.surname ?? ""}`.trim().toLowerCase();

  return {
    customerKey,
    notes: row.relationship_notes ?? "",
    updatedAt: row.updated_at ?? new Date().toISOString(),
    vipTags,
  };
}

function toCustomerPayload(input: CustomerWriteInput) {
  const customerKey =
    input.customerKey ??
    getCustomerKey({
      email: input.email,
      name: input.name,
      phone: input.mobile,
    });
  const nameParts = splitCustomerName(input.name, customerKey);
  const vipTags = input.vipTags ?? [];

  return {
    dietary_requirements: input.dietaryRequirements ?? null,
    email: input.email?.trim().toLowerCase() || null,
    first_name: nameParts.firstName,
    mobile: input.mobile?.trim() || null,
    preferences: {
      customerKey,
      vipTags,
    },
    relationship_notes: input.relationshipNotes ?? "",
    surname: nameParts.surname,
    vip_status: vipTags[0] ?? null,
  };
}

function getCustomerInputFromCrmRecord(
  record: DemoCustomerCrmRecord,
): CustomerWriteInput {
  return {
    customerKey: record.customerKey,
    email: record.customerKey.includes("@") ? record.customerKey : undefined,
    name: record.customerKey,
    relationshipNotes: record.notes,
    vipTags: record.vipTags,
  };
}

async function getSupabaseCustomers() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("customers")
    .select(
      "id,first_name,surname,email,mobile,vip_status,preferences,relationship_notes,dietary_requirements,created_at,updated_at",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[Zingara Supabase] Failed to load customers", error);
    return null;
  }

  return (data ?? []) as SupabaseCustomerRow[];
}

async function findSupabaseCustomer(input: CustomerWriteInput) {
  const rows = await getSupabaseCustomers();
  const customerKey =
    input.customerKey ??
    getCustomerKey({
      email: input.email,
      name: input.name,
      phone: input.mobile,
    });
  const email = input.email?.trim().toLowerCase();
  const mobile = input.mobile?.replace(/\D/g, "");

  return rows?.find((row) => {
    const rowMobile = row.mobile?.replace(/\D/g, "");

    return (
      row.preferences?.customerKey === customerKey ||
      (email && row.email === email) ||
      (mobile && rowMobile === mobile)
    );
  });
}

export async function getOrCreateCustomerIdFromInfo(
  customer: CustomerInfo,
  extras: Omit<CustomerWriteInput, "email" | "mobile" | "name"> = {},
) {
  const input = {
    ...extras,
    email: customer.email,
    mobile: customer.phone,
    name: customer.name,
  };
  const existingCustomer = await findSupabaseCustomer(input);

  if (existingCustomer) {
    await upsertCustomer(input);

    return existingCustomer.id;
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return undefined;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(toCustomerPayload(input))
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[Zingara Supabase] Failed to create booking customer", error);
    return undefined;
  }

  return (data as { id?: string } | null)?.id;
}

async function persistCustomersToSupabase(records: DemoCustomerCrmRecord[]) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return records;
  }

  await Promise.all(records.map((record) => upsertCustomer(getCustomerInputFromCrmRecord(record))));

  return records;
}

export async function getCustomers() {
  const fallbackCustomers = getStoredDemoCustomerCrm();
  const rows = await getSupabaseCustomers();

  if (!rows) {
    return fallbackCustomers;
  }

  if (rows.length === 0) {
    await persistCustomersToSupabase(fallbackCustomers);

    return fallbackCustomers;
  }

  return rows.map(toCrmRecord);
}

export async function getCustomer(id: string) {
  const rows = await getSupabaseCustomers();

  if (!rows) {
    return getStoredDemoCustomerCrm().find(
      (record) => record.customerKey === id,
    );
  }

  const row = rows.find(
    (customer) =>
      customer.id === id ||
      customer.email === id ||
      customer.preferences?.customerKey === id,
  );

  return row ? toCrmRecord(row) : undefined;
}

export async function createCustomer(input: CustomerWriteInput) {
  const supabase = getSupabaseClient();
  const payload = toCustomerPayload(input);

  if (!supabase) {
    return undefined;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select(
      "id,first_name,surname,email,mobile,vip_status,preferences,relationship_notes,dietary_requirements,created_at,updated_at",
    )
    .maybeSingle();

  if (error) {
    console.error("[Zingara Supabase] Failed to create customer", error);
    return undefined;
  }

  return data ? toCrmRecord(data as SupabaseCustomerRow) : undefined;
}

export async function updateCustomer(
  id: string,
  input: CustomerWriteInput,
) {
  const supabase = getSupabaseClient();
  const payload = toCustomerPayload(input);

  if (!supabase) {
    return undefined;
  }

  const { data, error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", id)
    .select(
      "id,first_name,surname,email,mobile,vip_status,preferences,relationship_notes,dietary_requirements,created_at,updated_at",
    )
    .maybeSingle();

  if (error) {
    console.error("[Zingara Supabase] Failed to update customer", error);
    return undefined;
  }

  return data ? toCrmRecord(data as SupabaseCustomerRow) : undefined;
}

export async function upsertCustomer(input: CustomerWriteInput) {
  const supabase = getSupabaseClient();
  const payload = toCustomerPayload(input);

  if (!supabase) {
    return undefined;
  }

  const existingCustomer = await findSupabaseCustomer(input);

  if (existingCustomer) {
    const mergedPayload = {
      ...payload,
      dietary_requirements:
        payload.dietary_requirements ??
        existingCustomer.dietary_requirements ??
        null,
      first_name: payload.first_name || existingCustomer.first_name,
      relationship_notes:
        payload.relationship_notes ||
        existingCustomer.relationship_notes ||
        "",
      surname: payload.surname ?? existingCustomer.surname,
      vip_status: payload.vip_status ?? existingCustomer.vip_status,
    };

    const { data, error } = await supabase
      .from("customers")
      .update(mergedPayload)
      .eq("id", existingCustomer.id)
      .select(
        "id,first_name,surname,email,mobile,vip_status,preferences,relationship_notes,dietary_requirements,created_at,updated_at",
      )
      .maybeSingle();

    if (error) {
      console.error("[Zingara Supabase] Failed to upsert customer", error);
      return undefined;
    }

    return data ? toCrmRecord(data as SupabaseCustomerRow) : undefined;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select(
      "id,first_name,surname,email,mobile,vip_status,preferences,relationship_notes,dietary_requirements,created_at,updated_at",
    )
    .maybeSingle();

  if (error) {
    console.error("[Zingara Supabase] Failed to upsert customer", error);
    return undefined;
  }

  return data ? toCrmRecord(data as SupabaseCustomerRow) : undefined;
}

export async function upsertCustomerFromInfo(
  customer: CustomerInfo,
  extras: Omit<CustomerWriteInput, "email" | "mobile" | "name"> = {},
) {
  return upsertCustomer({
    ...extras,
    email: customer.email,
    mobile: customer.phone,
    name: customer.name,
  });
}

export async function saveCustomers(records: DemoCustomerCrmRecord[]) {
  storeDemoCustomerCrm(records);
  await persistCustomersToSupabase(records);

  return getCustomers();
}
