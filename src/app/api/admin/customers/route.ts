import {
  getRequestingUser,
  getServiceClient,
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  diffAuditFields,
  recordAuditEvent,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

type CustomerWriteInput = {
  customerKey?: string;
  dietaryRequirements?: string;
  email?: string;
  mobile?: string;
  name?: string;
  preferences?: Partial<CustomerPreferences>;
  relationshipNotes?: string;
  vipTags?: string[];
};

type CustomerPreferences = {
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
  customerKey?: string;
  marketingPreference?: string;
  vipTags?: string[];
};

type SupabaseCustomerRow = {
  dietary_requirements: string | null;
  email: string | null;
  first_name: string;
  id: string;
  mobile: string | null;
  preferences: CustomerPreferences | null;
  relationship_notes: string | null;
  surname: string | null;
  vip_status: string | null;
};

const customerSelect =
  "id,first_name,surname,email,mobile,vip_status,preferences,relationship_notes,dietary_requirements,created_at,updated_at";
const customerAuditFields = [
  "first_name",
  "surname",
  "email",
  "mobile",
  "vip_status",
  "preferences",
  "relationship_notes",
  "dietary_requirements",
];

async function getAuditActor(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.staffProfile || !auth.user) {
    return {
      staffProfile: null,
      user: await getRequestingUser(request),
    };
  }

  return {
    staffProfile: auth.staffProfile,
    user: auth.user,
  };
}

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

function toCustomerPayload(
  input: CustomerWriteInput,
  existingPreferences: CustomerPreferences | null = null,
) {
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
      ...(existingPreferences ?? {}),
      customerKey,
      vipTags,
      ...(input.preferences ?? {}),
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
  const existingCustomer = await findCustomer(serviceClient, input);
  const payload = toCustomerPayload(
    input,
    existingCustomer?.preferences ?? null,
  );

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

    const existingCustomer = await findCustomer(serviceClient, body.input);
    const row = await upsertCustomer(serviceClient, body.input);
    const actor = await getAuditActor(request);
    const diff = diffAuditFields(
      existingCustomer as Record<string, unknown> | null,
      row as Record<string, unknown> | null,
      customerAuditFields,
    );

    try {
      await recordAuditEvent(serviceClient, actor.staffProfile, actor.user, {
        action: existingCustomer ? "customer.edit" : "customer.create",
        afterValues: diff.afterValues,
        beforeValues: diff.beforeValues,
        changedFields:
          diff.changedFields.length > 0 ? diff.changedFields : ["id"],
        entityId: (row as { id?: string } | null)?.id ?? null,
        entityReference:
          (row as { email?: string | null; mobile?: string | null; id?: string })
            ?.email ??
          (row as { mobile?: string | null })?.mobile ??
          (row as { id?: string })?.id ??
          "unknown-customer",
        entityType: "customer",
        outcome: "success",
        request,
        sourceArea: "Customers",
      });
    } catch {
      return Response.json(
        {
          auditError:
            "Customer was saved, but the audit event could not be recorded.",
          row,
        },
        { status: 500 },
      );
    }

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
      archive?: { archived?: boolean; reason?: string };
      id?: string;
      input?: CustomerWriteInput;
    };

    if (body.archive) {
      if (!body.id) {
        return Response.json(
          { error: "Customer id is required." },
          { status: 400 },
        );
      }

      const auth = await requireActiveStaff(request);

      if (auth.error || !auth.staffProfile || !auth.user) {
        return Response.json(
          { error: "Active staff authentication is required." },
          { status: 401 },
        );
      }

      if (!isSuperAdminProfile(auth.staffProfile)) {
        return Response.json(
          { error: "Super Admin access is required." },
          { status: 403 },
        );
      }

      const { data: beforeCustomer, error: beforeError } = await serviceClient
        .from("customers")
        .select(customerSelect)
        .eq("id", body.id)
        .maybeSingle();

      if (beforeError) {
        throw beforeError;
      }

      if (!beforeCustomer) {
        return Response.json(
          { error: "Customer could not be found." },
          { status: 404 },
        );
      }

      const previousPreferences =
        (beforeCustomer as SupabaseCustomerRow).preferences ?? {};
      const nextPreferences: CustomerPreferences = {
        ...previousPreferences,
      };

      if (body.archive.archived) {
        nextPreferences.archivedAt = new Date().toISOString();
        nextPreferences.archivedBy =
          auth.staffProfile.full_name ?? auth.user.email ?? auth.staffProfile.id;
        nextPreferences.archiveReason = body.archive.reason?.trim() || undefined;
      } else {
        delete nextPreferences.archivedAt;
        delete nextPreferences.archivedBy;
        delete nextPreferences.archiveReason;
      }

      const { data, error } = await serviceClient
        .from("customers")
        .update({ preferences: nextPreferences })
        .eq("id", body.id)
        .select(customerSelect)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const diff = diffAuditFields(
        beforeCustomer as Record<string, unknown> | null,
        data as Record<string, unknown> | null,
        customerAuditFields,
      );

      try {
        await recordAuditEvent(serviceClient, auth.staffProfile, auth.user, {
          action: body.archive.archived
            ? "customer.archive"
            : "customer.restore",
          afterValues: diff.afterValues,
          beforeValues: diff.beforeValues,
          changedFields:
            diff.changedFields.length > 0
              ? diff.changedFields
              : ["preferences"],
          entityId: body.id,
          entityReference:
            (data as { email?: string | null; mobile?: string | null })?.email ??
            (data as { mobile?: string | null })?.mobile ??
            body.id,
          entityType: "customer",
          outcome: "success",
          request,
          sourceArea: "Customers",
        });
      } catch {
        return Response.json(
          {
            auditError:
              "Customer archive state was updated, but the audit event could not be recorded.",
            row: data,
          },
          { status: 500 },
        );
      }

      return Response.json({ row: data });
    }

    if (!body.input) {
      return Response.json(
        { error: "Customer input is required." },
        { status: 400 },
      );
    }

    if (!body.id) {
      const existingCustomer = await findCustomer(serviceClient, body.input);
      const row = await upsertCustomer(serviceClient, body.input);
      const actor = await getAuditActor(request);
      const diff = diffAuditFields(
        existingCustomer as Record<string, unknown> | null,
        row as Record<string, unknown> | null,
        customerAuditFields,
      );

      await tryRecordAuditEvent(serviceClient, actor.staffProfile, actor.user, {
        action: existingCustomer ? "customer.edit" : "customer.create",
        afterValues: diff.afterValues,
        beforeValues: diff.beforeValues,
        changedFields:
          diff.changedFields.length > 0 ? diff.changedFields : ["id"],
        entityId: (row as { id?: string } | null)?.id ?? null,
        entityReference:
          (row as { email?: string | null; mobile?: string | null; id?: string })
            ?.email ??
          (row as { mobile?: string | null })?.mobile ??
          (row as { id?: string })?.id ??
          "unknown-customer",
        entityType: "customer",
        outcome: "success",
        request,
        sourceArea: "Customers",
      });

      return Response.json({ row });
    }

    const { data: beforeCustomer, error: beforeError } = await serviceClient
      .from("customers")
      .select(customerSelect)
      .eq("id", body.id)
      .maybeSingle();

    if (beforeError) {
      throw beforeError;
    }

    const { data, error } = await serviceClient
      .from("customers")
      .update(
        toCustomerPayload(
          body.input,
          (beforeCustomer as SupabaseCustomerRow | null)?.preferences ?? null,
        ),
      )
      .eq("id", body.id)
      .select(customerSelect)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const actor = await getAuditActor(request);
    const diff = diffAuditFields(
      beforeCustomer as Record<string, unknown> | null,
      data as Record<string, unknown> | null,
      customerAuditFields,
    );

    try {
      await recordAuditEvent(serviceClient, actor.staffProfile, actor.user, {
        action: "customer.edit",
        afterValues: diff.afterValues,
        beforeValues: diff.beforeValues,
        changedFields: diff.changedFields,
        entityId: body.id,
        entityReference:
          (data as { email?: string | null; mobile?: string | null })?.email ??
          (data as { mobile?: string | null })?.mobile ??
          body.id,
        entityType: "customer",
        outcome: "success",
        request,
        sourceArea: "Customers",
      });
    } catch {
      return Response.json(
        {
          auditError:
            "Customer was updated, but the audit event could not be recorded.",
          row: data,
        },
        { status: 500 },
      );
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
