import { type AdminRole } from "@/lib/zingaraAccess";
import {
  type StaffManagementProfile,
  getStaffRoles,
} from "./staffManagement";
import { getSupabaseClient } from "./client";

export type CreateStaffUserInput = {
  email: string;
  fullName: string;
  role: AdminRole;
  venueScope: string[];
};

export async function getAvailableRoles() {
  return getStaffRoles();
}

async function postStaffInvitation(
  action: "create-profile" | "create-user",
  input: CreateStaffUserInput,
) {
  const supabase = getSupabaseClient();
  const session = supabase
    ? await supabase.auth.getSession()
    : { data: { session: null } };
  const accessToken = session.data.session?.access_token;

  if (!accessToken) {
    return {
      error: "No authenticated admin session is available.",
      profile: null,
    };
  }

  const response = await fetch("/api/admin/staff-invitations", {
    body: JSON.stringify({
      action,
      ...input,
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = (await response.json()) as {
    error?: string;
    profile?: StaffManagementProfile;
  };

  if (!response.ok) {
    return {
      error: payload.error ?? "Staff user could not be created.",
      profile: null,
    };
  }

  return {
    error: "",
    profile: payload.profile ?? null,
  };
}

export async function createStaffUser(input: CreateStaffUserInput) {
  return postStaffInvitation("create-user", input);
}

export async function createStaffProfile(input: CreateStaffUserInput) {
  return postStaffInvitation("create-profile", input);
}
