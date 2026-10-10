import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ensureSeeded } from "@/lib/bootstrap";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await ensureSeeded();
  const actor = await getActor();
  if (!actor) redirect("/");
  return <AppShell actor={actor}>{children}</AppShell>;
}
