import { getActor } from "@/lib/session";
import { apiError,handleError } from "@/lib/api";
import { createCardSlotCheckout } from "@/lib/payments";
export async function POST() {
  const a=await getActor(); if(!a)return apiError(401,"unauthenticated","Sign in first.");
  try {return Response.json(await createCardSlotCheckout(a));}catch(e){return handleError(e);}
}
