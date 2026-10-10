"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { button, field, label, Notice } from "./ui";
export interface WorkflowField { name:string; label:string; type?:"text"|"email"|"number"|"date"|"textarea"|"select"|"checkbox"|"file"; value?:string|number; required?:boolean; options?:{ value:string; label:string }[]; hint?:string }
export function WorkflowForm({ resource,id,fields=[],actions=[{ value:"save",label:"Save" }],multipart=false }:{ resource:string; id?:string; fields?:WorkflowField[]; actions?:{ value:string; label:string }[]; multipart?:boolean }) {
  const uid=useId(),router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  return <form className="space-y-3" onSubmit={async e=>{
    e.preventDefault(); setBusy(true);setError("");setSuccess("");
    const form=e.currentTarget; const data=new FormData(form);
    const submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    data.set("action",submitter?.value ?? actions[0].value); if(id)data.set("id",id);
    try {
      const res=await fetch(`/api/workflows/${resource}`,{ method:"POST",...(multipart ? { body:data } : { headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(data)) }) });
      const j=await res.json(); if(!res.ok)throw new Error(j.error?.message ?? "Unable to save.");
      setSuccess("Saved.");router.refresh(); if(["members","societies"].includes(resource))form.reset();
    } catch(err) {setError(err instanceof Error ? err.message : "Unable to save. Please retry.");} finally{setBusy(false);}
  }}>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(f=><div key={f.name} className={f.type === "textarea" || f.type === "checkbox" ? "sm:col-span-2" : ""}>
      <label htmlFor={`${uid}-${f.name}`} className={label}>{f.label}</label>
      {f.type === "textarea" ? <textarea id={`${uid}-${f.name}`} name={f.name} className={field} rows={5} defaultValue={f.value} required={f.required} maxLength={10000}/> : f.type === "select" ? <select id={`${uid}-${f.name}`} name={f.name} className={field} defaultValue={f.value} required={f.required}>{f.options?.map(o=><option value={o.value} key={o.value}>{o.label}</option>)}</select> : <input id={`${uid}-${f.name}`} name={f.name} className={f.type === "checkbox" ? "h-5 w-5 accent-stone" : field} type={f.type ?? "text"} defaultValue={f.value} required={f.required} min={f.type === "number" ? 0 : undefined} step={f.type === "number" ? "0.01" : undefined} accept={f.type === "file" ? ".pdf,.png,.jpg,.jpeg" : undefined}/>}
      {f.hint && <p className="mt-1 text-xs text-ink-3">{f.hint}</p>}
    </div>)}</div>
    {error && <Notice tone="bad">{error}</Notice>}{success && <p role="status" className="text-sm text-ok">{success}</p>}
    <div className="flex flex-wrap gap-2">{actions.map((a,i)=><button type="submit" key={a.value} value={a.value} disabled={busy} className={button(i===0 ? "primary" : "secondary")}>{busy ? "Saving…" : a.label}</button>)}</div>
  </form>;
}
