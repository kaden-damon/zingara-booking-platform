"use client";

import { useEffect, useState } from "react";
import type { ResolvedSecretPassword } from "@/lib/secretPassword";
import { getResolvedSecretPassword } from "@/lib/supabase/secretPasswords";

export default function SecretPasswordOperationalBanner({ showId }: { showId: string }) {
  const [state, setState] = useState<{ enabled: boolean; resolved: ResolvedSecretPassword | null } | null>(null);
  useEffect(() => {
    let active = true;
    void getResolvedSecretPassword(showId).then((payload) => { if (active) setState(payload); }).catch(() => { if (active) setState(null); });
    return () => { active = false; };
  }, [showId]);
  if (!state?.enabled) return null;
  return <div className="rounded-lg border border-[#D8C36A]/30 bg-black/55 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Secret Password</p><p className="mt-1 font-semibold text-[#F2D66C]">{state.resolved?.phrase ?? "No Secret Password configured"}</p></div>;
}
