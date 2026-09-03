"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ReportGenerationLockResult,
  ReportGenerationLockState,
} from "@/lib/reportGenerationLock";
import { fetchSupabaseApi } from "@/lib/supabase/apiClient";

export function useReportGenerationLock(enabled = true) {
  const [lock, setLock] = useState<ReportGenerationLockState | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const payload = await fetchSupabaseApi<{ lock: ReportGenerationLockState | null }>(
        "/api/admin/analytics/report-lock",
      );
      setLock(payload.lock);
    } catch {
      // Generation routes remain authoritative if this advisory status request fails.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  const acquire = useCallback(
    async (reportType: string, reportScope: Record<string, unknown>) => {
      const payload = await fetchSupabaseApi<{ lock: ReportGenerationLockResult }>(
        "/api/admin/analytics/report-lock",
        {
          body: { action: "acquire", reportScope, reportType },
          method: "POST",
        },
      );
      setLock(payload.lock);
      return payload.lock;
    },
    [],
  );

  const release = useCallback(
    async (
      lockToken: string,
      reportType: string,
      reportScope: Record<string, unknown>,
      outcome: "failed" | "success",
    ) => {
      await fetchSupabaseApi<{ released: boolean }>(
        "/api/admin/analytics/report-lock",
        {
          body: { action: "release", lockToken, outcome, reportScope, reportType },
          method: "POST",
        },
      );
      setLock(null);
      await refresh();
    },
    [refresh],
  );

  return { acquire, lock, refresh, release };
}
