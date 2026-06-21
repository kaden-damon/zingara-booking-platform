import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type CustomerWriteInput = {
  customerKey?: string;
  dietaryRequirements?: string;
  email?: string;
  mobile?: string;
  name?: string;
  relationshipNotes?: string;
  vipTags?: string[];
};

type SupabaseCustomerRow = {
  dietary_requirements: string | null;
  email: string | null;
  first_name: string;
  id: string;
  mobile: string | null;
  preferences: {
    customerKey?: string;
    vipTags?: string[];
  } | null;
  relationship_notes: string | null;
  surname: string | null;
  vip_status: string | null;
};

const customerSelect =
  "id,first_name,surname,email,mobile,vip_status,preferences,relationship_notes,dietary_requirements,created_at,updated_at";

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

async function findCustomer(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  input: CustomerWriteInput,
) {
  const customerKey =
    input.customerKey ??
    getCustomerKey({
      email: input.email,
      name: input.name,
      phone: input.mobile,
    });
  const email = input.email?.trim().toLowerCase();
  const mobile = input.mobile?.replace(/\D/g, "");
  const filters = [
    email ? `email.eq.${email}` : "",
    input.mobile?.trim() ? `mobile.eq.${input.mobile.trim()}` : "",
  ].filter(Boolean);
  let query = serviceClient.from("customers").select(customerSelect);

  if (filters.length > 0) {
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as SupabaseCustomerRow[]).find((row) => {
    const rowMobile = row.mobile?.replace(/\D/g, "");

    return (
      row.preferences?.customerKey === customerKey ||
      (email && row.email === email) ||
      (mobile && rowMobile === mobile)
    );
  });
}

async function upsertCustomer(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  input: CustomerWriteInput,
) {
  const payload = toCustomerPayload(input);
  const existingCustomer = await findCustomer(serviceClient, input);

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
    const { data, error } = await serviceClient
      .from("customers")
      .update(mergedPayload)
      .eq("id", existingCustomer.id)
      .select(customerSelect)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await serviceClient
    .from("customers")
    .insert(payload)
    .select(customerSelect)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
    .from("customers")
    .select(customerSelect)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load customers", error);

    return Response.json(
      { error: "Customers could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}

export async function POST(request: Request) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as { input?: CustomerWriteInput };

    if (!body.input) {
      return Response.json(
        { error: "Customer input is required." },
        { status: 400 },
      );
    }

    const row = await upsertCustomer(serviceClient, body.input);

    return Response.json({ row });
  } catch (error) {
    console.error("[Zingara API] Failed to save customer", error);

    return Response.json(
      { error: "Customer could not be saved." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      input?: CustomerWriteInput;
    };

    if (!body.input) {
      return Response.json(
        { error: "Customer input is required." },
        { status: 400 },
      );
    }

    if (!body.id) {
      const row = await upsertCustomer(serviceClient, body.input);

      return Response.json({ row });
    }

    const { data, error } = await serviceClient
      .from("customers")
      .update(toCustomerPayload(body.input))
      .eq("id", body.id)
      .select(customerSelect)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Response.json({ row: data });
  } catch (error) {
    console.error("[Zingara API] Failed to update customer", error);

    return Response.json(
      { error: "Customer could not be updated." },
      { status: 500 },
    );
  }
}
