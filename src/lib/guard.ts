import { redirect } from "next/navigation";
import { getActor, type AdminActor, type MemberActor } from "./session";

/** Pages that are about one society need a member actor; admins go to the overview. */
export async function requireMember(): Promise<MemberActor> {
  const a = await getActor();
  if (!a) redirect("/");
  if (a.kind !== "member") redirect("/admin");
  return a;
}

/** Society money pages (funding, billing): treasurer only. Other officers go to their overview. */
export async function requireTreasurer(): Promise<MemberActor> {
  const a = await requireMember();
  if (a.role !== "treasurer") redirect("/dashboard");
  return a;
}

export async function requireAdmin(): Promise<AdminActor> {
  const a = await getActor();
  if (!a) redirect("/");
  if (a.kind !== "admin") redirect("/dashboard");
  return a;
}

export async function requireActor() {
  const a = await getActor();
  if (!a) redirect("/");
  return a;
}
