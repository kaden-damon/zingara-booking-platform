import { getPayFastConfig } from "@/lib/payfast/config";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type HealthStatus = "healthy" | "offline" | "warning";

type HealthCheck = {
  description: string;
  displayLabel?: string;
  name: string;
  status: HealthStatus;
};

const dataPortabilityProbeId = "00000000-0000-0000-0000-000000000000";
let lastSuccessfulCriticalHealthCheck: string | null = null;
const criticalHealthChecks = new Set([
  "Audit Trail",
  "Booking Locks",
  "Bookings",
  "Customers",
  "Data Portability",
  "Database",
  "QR Validation",
  "Ticket Engine",
]);

function getEnvironmentLabel() {
  if (process.env.VERCEL_ENV === "production") {
    return "Production";
  }

  if (process.env.VERCEL_ENV === "preview") {
    return "Vercel Preview";
  }

  return "Local Development";
}

function getDatabaseLabel() {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

    return url.hostname.split(".")[0] || "Configured";
  } catch {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? "Configured" : "Not configured";
  }
}

function getBuildLabel() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  if (commit) {
    return commit;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}.${month}.${day}`;
}

function getOverallStatus(checks: HealthCheck[]): HealthStatus {
  if (
    checks.some(
      (check) =>
        check.status === "offline" &&
        ["Database", "Bookings", "Payments"].includes(check.name),
    )
  ) {
    return "offline";
  }

  if (checks.some((check) => check.status !== "healthy")) {
    return "warning";
  }

  return "healthy";
}

function didCriticalHealthChecksPass(checks: HealthCheck[], environment: string) {
  return checks.every((check) => {
    if (criticalHealthChecks.has(check.name)) {
      return check.status === "healthy";
    }

    if (check.name === "Payments" && environment === "Production") {
      return check.status === "healthy";
    }

    return true;
  });
}

async function runCheck(
  name: string,
  action: () => Promise<string>,
  options: { offline?: boolean } = {},
): Promise<HealthCheck> {
  try {
    return {
      description: await action(),
      name,
      status: "healthy",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Health check failed.";

    return {
      description: message,
      name,
      status: options.offline ? "offline" : "warning",
    };
  }
}

function getEmailHealth(): HealthCheck {
  const host = process.env.EMAIL_HOST || "smtp.office365.com";
  const port = Number(process.env.EMAIL_PORT || 587);
  const username = process.env.EMAIL_USERNAME;
  const password = process.env.EMAIL_PASSWORD;
  const fromAddress =
    process.env.EMAIL_FROM_ADDRESS || "bookings@zingara.co.za";

  return {
    description:
      host && port && username && password && fromAddress
        ? "SMTP configuration is loaded."
        : "SMTP configuration is incomplete.",
    name: "Email",
    status: host && port && username && password && fromAddress
      ? "healthy"
      : "warning",
  };
}

function getPushHealth(): HealthCheck {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT ?? "mailto:notifications@zingara.co.za";

  return {
    description:
      publicKey && privateKey && subject
        ? "Push notification configuration is loaded."
        : "Push notification configuration is incomplete.",
    name: "Push Notifications",
    status: publicKey && privateKey && subject ? "healthy" : "warning",
  };
}

function getPayFastHealth(): HealthCheck {
  const config = getPayFastConfig();
  const environment = getEnvironmentLabel();

  if (config.configured) {
    return {
      description: `PayFast ${config.mode} configuration is present.`,
      name: "Payments",
      status: "healthy",
    };
  }

  const missingItems = [
    ["merchant identification", config.merchantId],
    ["merchant key", config.merchantKey],
    ["passphrase", config.passphrase],
    ["return URL", config.returnUrl],
    ["cancel URL", config.cancelUrl],
    ["notify URL", config.notifyUrl],
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label);

  if (environment === "Local Development") {
    return {
      description: `Production PayFast configuration is not fully loaded in this local environment. Missing local configuration: ${missingItems.join(", ")}.`,
      displayLabel: "🟡 Local Configuration",
      name: "Payments",
      status: "warning",
    };
  }

  return {
    description: `PayFast configuration is incomplete. Missing required configuration: ${missingItems.join(", ")}.`,
    name: "Payments",
    status: "warning",
  };
}

export async function GET(request: Request) {
  const { error, serviceClient, staffProfile } =
    await requireActiveStaff(request);

  if (error || !serviceClient || !staffProfile) {
    return error;
  }

  const environment = getEnvironmentLabel();
  const checks = await Promise.all([
    runCheck(
      "Database",
      async () => {
        const { error: queryError } = await serviceClient
          .from("shows")
          .select("id", { count: "exact", head: true });

        if (queryError) {
          throw queryError;
        }

        return "Supabase connection OK.";
      },
      { offline: true },
    ),
    runCheck("Bookings", async () => {
      const { error: queryError, count } = await serviceClient
        .from("bookings")
        .select("id", { count: "exact", head: true });

      if (queryError) {
        throw queryError;
      }

      return `Bookings query OK · ${count ?? 0} records reachable.`;
    }),
    runCheck("Customers", async () => {
      const { error: queryError, count } = await serviceClient
        .from("customers")
        .select("id", { count: "exact", head: true });

      if (queryError) {
        throw queryError;
      }

      return `Customers query OK · ${count ?? 0} records reachable.`;
    }),
    runCheck("Audit Trail", async () => {
      const { error: queryError } = await serviceClient
        .from("audit_events")
        .select("id", { count: "exact", head: true });

      if (queryError) {
        throw queryError;
      }

      return "Audit event store is reachable.";
    }),
    runCheck("Data Portability", async () => {
      const tableChecks = await Promise.all([
        serviceClient
          .from("data_portability_import_runs")
          .select("id", { count: "exact", head: true }),
        serviceClient
          .from("data_portability_restore_points")
          .select("id", { count: "exact", head: true }),
        serviceClient
          .from("data_portability_audit_events")
          .select("id", { count: "exact", head: true }),
      ]);
      const tableError = tableChecks.find((result) => result.error)?.error;

      if (tableError) {
        throw tableError;
      }

      const { error: restoreProbeError } = await serviceClient.rpc(
        "restore_data_portability_import",
        {
          p_import_id: dataPortabilityProbeId,
          p_staff_profile_id: staffProfile.id,
        },
      );

      if (
        restoreProbeError &&
        /function .*restore_data_portability_import|could not find the function/i.test(
          restoreProbeError.message,
        )
      ) {
        throw restoreProbeError;
      }

      return "Import and restore tables reachable; restore RPC callable.";
    }),
    Promise.resolve(getPayFastHealth()),
    Promise.resolve(getEmailHealth()),
    Promise.resolve(getPushHealth()),
    runCheck("Ticket Engine", async () => {
      const { error: queryError } = await serviceClient
        .from("tickets")
        .select("id", { count: "exact", head: true });

      if (queryError) {
        throw queryError;
      }

      return "Ticket lookup store is reachable.";
    }),
    runCheck("QR Validation", async () => {
      const { error: queryError } = await serviceClient
        .from("ticket_validations")
        .select("id", { count: "exact", head: true });

      if (queryError) {
        throw queryError;
      }

      return "Ticket validation lookup path is reachable.";
    }),
    runCheck("Booking Locks", async () => {
      const { error: queryError, count } = await serviceClient
        .from("booking_edit_locks")
        .select("id", { count: "exact", head: true })
        .is("released_at", null);

      if (queryError) {
        throw queryError;
      }

      return `Booking lock table reachable · ${count ?? 0} active.`;
    }),
  ]);
  const { count: activeLockCount } = await serviceClient
    .from("booking_edit_locks")
    .select("id", { count: "exact", head: true })
    .is("released_at", null);
  const generatedAt = new Date().toISOString();

  if (didCriticalHealthChecksPass(checks, environment)) {
    lastSuccessfulCriticalHealthCheck = generatedAt;
  }

  return Response.json({
    checks,
    generatedAt,
    overallStatus: getOverallStatus(checks),
    platform: {
      activeBookingLocks: activeLockCount ?? 0,
      build: getBuildLabel(),
      currentDatabase: getDatabaseLabel(),
      currentDateTime: generatedAt,
      currentStaff: staffProfile.full_name,
      autoRefresh: "Every 60 seconds",
      environment,
      lastSuccessfulHealthCheck: lastSuccessfulCriticalHealthCheck,
      platformVersion: "1.0 RC",
      staffLoggedIn: "Current session verified",
    },
  });
}
