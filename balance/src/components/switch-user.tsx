"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useTransition } from "react";

export function SwitchUser() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/session", { method: "DELETE" });
          router.push("/");
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden /> Switch user
    </button>
  );
}
