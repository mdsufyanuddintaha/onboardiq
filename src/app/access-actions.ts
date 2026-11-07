"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { addUserToGroup } from "@/lib/ldap";
import { requireRole } from "@/lib/session";
import { rolesFor } from "@/lib/perm";
import { audit } from "@/lib/audit";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export async function createAccessRequestAction(formData: FormData) {
  const s = await requireRole(...rolesFor("createAccess"));
  const employee = str(formData, "employee").toLowerCase();
  const groupName = str(formData, "groupName");
  const title = str(formData, "title");
  const description = str(formData, "description");
  const priority = str(formData, "priority") as (typeof PRIORITIES)[number];

  if (!/^[a-z][a-z0-9.]{2,19}$/.test(employee)) redirect("/access/new?error=Enter+the+employee's+username.");
  if (!/^[\w .\-]{2,64}$/.test(groupName)) redirect("/access/new?error=Enter+a+valid+AD+group+name.");
  if (title.length < 3 || title.length > 120) redirect("/access/new?error=Give+the+request+a+title+(3-120+characters).");
  if (description.length < 10 || description.length > 1000) redirect("/access/new?error=Explain+why+the+access+is+needed+(10-1000+characters).");
  if (!PRIORITIES.includes(priority)) redirect("/access/new?error=Choose+a+priority.");

  const r = await db.accessRequest.create({
    data: { employee, groupName, title, description, priority, requestedBy: s.username },
  });
  await audit(s, "ACCESS_REQUESTED", null, `#${r.number}: ${groupName} for ${employee}`, r.id);
  revalidatePath("/access");
  redirect(`/access/${r.id}`);
}

export async function decideAccessAction(formData: FormData) {
  const s = await requireRole(...rolesFor("decideAccess"));
  const id = str(formData, "id");
  const decision = str(formData, "decision");
  const note = str(formData, "note").slice(0, 300);
  const r = await db.accessRequest.findUnique({ where: { id } });
  if (!r || r.status !== "OPEN") redirect(`/access/${id}?error=This+request+is+not+waiting+for+a+decision.`);
  // Separation of duties
  if (r.requestedBy === s.username) {
    await audit(s, "ACCESS_DECISION_DENIED_SELF", null, `#${r.number}`, id);
    redirect(`/access/${id}?error=You+can't+decide+your+own+request.`);
  }
  const approve = decision === "approve";
  await db.accessRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "DENIED", decidedBy: s.username, decidedAt: new Date(), decisionNote: note || null },
  });
  await audit(s, approve ? "ACCESS_APPROVED" : "ACCESS_DENIED", null, `#${r.number}${note ? ": " + note : ""}`, id);
  revalidatePath("/access");
  redirect(`/access/${id}`);
}

// IT adds the employee to the AD group once the request is approved.
export async function fulfillAccessAction(formData: FormData) {
  const s = await requireRole(...rolesFor("fulfillAccess"));
  const id = str(formData, "id");
  const r = await db.accessRequest.findUnique({ where: { id } });
  if (!r || r.status !== "APPROVED") redirect(`/access/${id}?error=Only+approved+requests+can+be+granted.`);
  try {
    await addUserToGroup(r.employee, r.groupName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await db.accessRequest.update({ where: { id }, data: { failureNote: msg } });
    await audit(s, "ACCESS_GRANT_FAILED", null, `#${r.number}: ${msg}`, id);
    redirect(`/access/${id}?error=${encodeURIComponent("Couldn't add the user to the group: " + msg)}`);
  }
  await db.accessRequest.update({ where: { id }, data: { status: "FULFILLED", fulfilledBy: s.username, fulfilledAt: new Date(), failureNote: null } });
  await audit(s, "ACCESS_GRANTED", null, `#${r.number}: ${r.groupName} for ${r.employee}`, id);
  revalidatePath("/access");
  redirect(`/access/${id}`);
}

export async function commentAccessAction(formData: FormData) {
  const s = await requireRole("HR", "MANAGER", "IT", "AUDITOR");
  const id = str(formData, "id");
  const body = str(formData, "body");
  if (body.length < 1 || body.length > 1000) redirect(`/access/${id}?error=Write+a+comment+(up+to+1000+characters).`);
  const r = await db.accessRequest.findUnique({ where: { id }, select: { id: true } });
  if (!r) redirect("/access");
  await db.accessComment.create({ data: { accessRequestId: id, author: s.username, authorRole: s.roles.join(","), body } });
  revalidatePath(`/access/${id}`);
  redirect(`/access/${id}`);
}
