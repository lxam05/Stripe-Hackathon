"use client";

import { useEffect } from "react";

/**
 * The demo session is one cookie shared by every tab. If another tab switches user, this tab's
 * layout would keep showing the old user while new pages render for the new one, so when the
 * tab regains focus we check who is signed in and start over if it changed.
 */
export function SessionSync({ actorId }: { actorId: string }) {
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/session", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const { actor } = (await res.json()) as { actor: string | null };
      if (actor === actorId) return;
      window.location.assign(!actor ? "/" : actor === "admin" ? "/admin" : "/dashboard");
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [actorId]);
  return null;
}
