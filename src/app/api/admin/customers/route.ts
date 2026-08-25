import {
  getRequestingUser,
  getRolePermissions,
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

type CustomerIdentityInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
};

type CustomerCrmDetailsInput = {
  notes?: string;
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
const customerQueryBatchSize = 1000;
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
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase() ?? "";

  return trimmed || null;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  return trimmed || null;
}

function canManageCustomerIdentity(
  profile: Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"],
) {
  if (isSuperAdminProfile(profile)) {
    return true;
  }

  const role = Array.isArray(profile?.roles)
    ? profile?.roles[0]
    : profile?.roles;

  return getRolePermissions(role).includes("bookings:manage");
}

function toCustomerIdentityPayload(input: CustomerIdentityInput) {
  const firstName = input.firstName?.trim();
  const surname = normalizeOptionalText(input.lastName);
  const email = normalizeOptionalEmail(input.email);
  const mobile = normalizeOptionalText(input.mobile);

  if (!firstName) {
    return {
      error: "First name is required.",
      payload: null,
    };
  }

  if (email && !emailPattern.test(email)) {
    return {
      error: "Enter a valid email address.",
      payload: null,
    };
  }

  return {
    error: null,
    payload: {
      email,
      first_name: firstName,
      mobile,
      surname,
    },
  };
}

function getCustomerIdentityKey(payload: {
  email: string | null;
  first_name: string;
  mobile: string | null;
  surname: string | null;
}) {
  const email = payload.email?.trim().toLowerCase();
  const phone = payload.mobile?.replace(/\D/g, "");
  const name = [payload.first_name, payload.surname]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

  return email || phone || name || "unknown-customer";
}

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

async function fetchAllCustomers(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
) {
  const rows: SupabaseCustomerRow[] = [];

  for (let from = 0; ; from += customerQueryBatchSize) {
    const { data, error } = await serviceClient
      .from("customers")
      .select(customerSelect)
      .order("updated_at", { ascending: false })
      .range(from, from + customerQueryBatchSize - 1);

    if (error) {
      return { error, rows };
    }

    const batch = (data ?? []) as SupabaseCustomerRow[];
    rows.push(...batch);

    if (batch.length < customerQueryBatchSize) {
      return { error: null, rows };
    }
  }
}

async function fetchOtherCustomerMobiles(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  customerId: string,
) {
  const rows: Array<{ id: string; mobile: string | null }> = [];

  for (let from = 0; ; from += customerQueryBatchSize) {
    const { data, error } = await serviceClient
      .from("customers")
      .select("id,mobile")
      .neq("id", customerId)
      .order("id", { ascending: true })
      .range(from, from + customerQueryBatchSize - 1);

    if (error) {
      return { error, rows };
    }

    const batch = (data ?? []) as Array<{
      id: string;
      mobile: string | null;
    }>;
    rows.push(...batch);

    if (batch.length < customerQueryBatchSize) {
      return { error: null, rows };
    }
  }
}

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const { rows, error } = await fetchAllCustomers(serviceClient);

  if (error) {
    console.error("[Zingara API] Failed to load customers", error);

    return Response.json(
      { error: "Customers could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows });
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
      crm?: CustomerCrmDetailsInput;
      id?: string;
      input?: CustomerWriteInput;
      identity?: CustomerIdentityInput;
    };

    if (body.crm) {
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

      if (!canManageCustomerIdentity(auth.staffProfile)) {
        return Response.json(
          { error: "Customer edit access is required." },
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
      const vipTags = Array.isArray(body.crm.vipTags)
        ? body.crm.vipTags
        : previousPreferences.vipTags ?? [];
      const { data, error } = await serviceClient
        .from("customers")
        .update({
          preferences: {
            ...previousPreferences,
            vipTags,
          },
          relationship_notes:
            typeof body.crm.notes === "string"
              ? body.crm.notes
              : beforeCustomer.relationship_notes,
          vip_status: vipTags[0] ?? null,
        })
        .eq("id", body.id)
        .select(customerSelect)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const diff = diffAuditFields(
        beforeCustomer as Record<string, unknown> | null,
        data as Record<string, unknown> | null,
        ["relationship_notes", "preferences", "vip_status"],
      );

      await recordAuditEvent(serviceClient, auth.staffProfile, auth.user, {
        action: "customer.edit",
        afterValues: diff.afterValues,
        beforeValues: diff.beforeValues,
        changedFields:
          diff.changedFields.length > 0 ? diff.changedFields : ["crm"],
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

      return Response.json({ row: data });
    }

    if (body.identity) {
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

      if (!canManageCustomerIdentity(auth.staffProfile)) {
        return Response.json(
          { error: "Customer edit access is required." },
          { status: 403 },
        );
      }

      const { error: validationError, payload } =
        toCustomerIdentityPayload(body.identity);

      if (validationError || !payload) {
        return Response.json(
          { error: validationError ?? "Customer details are invalid." },
          { status: 400 },
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

      if (payload.email) {
        const { data: emailConflict, error: emailConflictError } =
          await serviceClient
            .from("customers")
            .select("id")
            .eq("email", payload.email)
            .neq("id", body.id)
            .maybeSingle();

        if (emailConflictError) {
          throw emailConflictError;
        }

        if (emailConflict) {
          return Response.json(
            {
              error:
                "Another customer profile already uses this email address.",
            },
            { status: 409 },
          );
        }
      }

      if (payload.mobile) {
        const normalizedMobile = payload.mobile.replace(/\D/g, "");
        const { rows: mobileRows, error: mobileConflictError } =
          await fetchOtherCustomerMobiles(serviceClient, body.id);

        if (mobileConflictError) {
          throw mobileConflictError;
        }

        const mobileConflict = (mobileRows ?? []).find(
          (row) => row.mobile?.replace(/\D/g, "") === normalizedMobile,
        );

        if (mobileConflict) {
          return Response.json(
            {
              error:
                "Another customer profile already uses this mobile number.",
            },
            { status: 409 },
          );
        }
      }

      const previousPreferences =
        (beforeCustomer as SupabaseCustomerRow).preferences ?? {};
      const identityUpdate = {
        ...payload,
        preferences: {
          ...previousPreferences,
          customerKey: getCustomerIdentityKey(payload),
        },
      };

      const { data, error } = await serviceClient
        .from("customers")
        .update(identityUpdate)
        .eq("id", body.id)
        .select(customerSelect)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const diff = diffAuditFields(
        beforeCustomer as Record<string, unknown> | null,
        data as Record<string, unknown> | null,
        ["first_name", "surname", "email", "mobile", "preferences"],
      );

      try {
        await recordAuditEvent(serviceClient, auth.staffProfile, auth.user, {
          action: "customer.identity_edit",
          afterValues: diff.afterValues,
          beforeValues: diff.beforeValues,
          changedFields:
            diff.changedFields.length > 0
              ? diff.changedFields
              : ["identity"],
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
              "Customer details were updated, but the audit event could not be recorded.",
            row: data,
          },
          { status: 500 },
        );
      }

      return Response.json({ row: data });
    }

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
