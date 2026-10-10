"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While something async is in flight (e.g. a JEV analysis), refresh server data every `ms`. */
export function AutoRefresh({ active, ms = 1500 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}
