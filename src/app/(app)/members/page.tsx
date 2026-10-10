import { requireMember } from "@/lib/guard";
import { listMembers } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/roles";
import { memberRoleOptions } from "@/lib/workflows";
import { PageHeader,Panel,SectionTitle,Notice } from "@/components/ui";
import { WorkflowForm } from "@/components/workflow-form";
export default async function MembersPage() {
  const a=await requireMember();
  return <><PageHeader title="Society members" eyebrow={a.societyName}>Everyone can submit expenses. Committee members may be issued a card by the treasurer. Council assigns the treasurer and optional senior treasurer.</PageHeader>
    <Panel><ul className="divide-y divide-line">{listMembers(a.societyId).map(m=><li key={m.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{m.name}</span><span className="text-ink-3">{ROLE_LABEL[m.role]}</span></li>)}</ul></Panel>
    {a.role === "treasurer" ? <Panel className="mt-6"><SectionTitle>Add a member</SectionTitle><WorkflowForm resource="members" actions={[{value:"add",label:"Add member"}]} fields={[{name:"name",label:"Full name",required:true},{name:"email",label:"Email",type:"email",required:true},{name:"role",label:"Role",type:"select",value:"member",options:memberRoleOptions.map(([value,label])=>({value,label}))}]}/></Panel> : <div className="mt-6"><Notice>Ask your treasurer to add members or issue committee cards.</Notice></div>}
  </>;
}
