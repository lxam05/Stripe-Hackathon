"use client";
import {useState} from "react";
import {button,Notice} from "./ui";
export function ExtraCardButton(){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <><button disabled={busy} className={button("secondary")} onClick={async()=>{setBusy(true);setError("");try{const r=await fetch("/api/billing/card-slot",{method:"POST"});const j=await r.json();if(!r.ok)throw new Error(j.error?.message ?? "Checkout failed");window.location.assign(j.url);}catch(e){setError(e instanceof Error ? e.message : "Checkout failed");setBusy(false);}}}>{busy ? "Opening checkout…" : "Add one card slot · €10"}</button>{error && <Notice tone="bad">{error}</Notice>}</>;
}
