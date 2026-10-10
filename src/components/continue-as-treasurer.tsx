"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function ContinueAsTreasurer({ actorId, firstName }: { actorId: string; firstName: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-2 rounded-full bg-stone px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-2 disabled:opacity-60"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actor: actorId }),
        });
        if (response.ok) router.push("/dashboard");
        else setBusy(false);
      }}
    >
      {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
      {busy ? "Opening Balance…" : `Continue as ${firstName}, treasurer →`}
    </button>
  );
}
