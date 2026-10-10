import { redirect } from "next/navigation";
import { getActor, type MemberActor } from "./session";

/** Pages that are about one society need a member actor; admins go to the overview. */
export async function requireMember(): Promise<MemberActor> {
  const a = await getActor();
  if (!a) redirect("/");
  if (a.kind !== "member") redirect("/admin");
  return a;
}

export async function requireActor() {
  const a = await getActor();
  if (!a) redirect("/");
  return a;
}
