"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { rolesFor } from "@/lib/perm";
import { audit } from "@/lib/audit";
import { isPrivilegedGroup } from "@/lib/groups";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createTemplateAction(formData: FormData) {
  const s = await requireRole(...rolesFor("manageTemplates"));
  const name = str(formData, "name");
  const department = str(formData, "department");
  const groups = Array.from(new Set(str(formData, "groups").split(/[,\n]/).map((g) => g.trim()).filter(Boolean)));

  if (name.length < 2 || name.length > 60) redirect("/templates?error=Name+the+role+(2-60+characters).");
  if (department.length < 2 || department.length > 60) redirect("/templates?error=Enter+a+department.");
  if (groups.length === 0 || groups.length > 20) redirect("/templates?error=Add+between+1+and+20+AD+groups.");
  if (!groups.every((g) => /^[\w .\-]{1,64}$/.test(g))) redirect("/templates?error=Group+names+can+only+use+letters,+digits,+spaces,+dots,+dashes+and+underscores.");
  const blocked = groups.find(isPrivilegedGroup);
  if (blocked) redirect(`/templates?error=${encodeURIComponent(`"${blocked}" is a privileged group and can't be assigned to new hires.`)}`);
  if (await db.roleTemplate.findUnique({ where: { name } })) redirect("/templates?error=A+role+with+that+name+already+exists.");

  await db.roleTemplate.create({ data: { name, department, adGroups: groups } });
  await audit(s, "TEMPLATE_CREATED", null, `${name}: ${groups.join(", ")}`);
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplateAction(formData: FormData) {
  const s = await requireRole(...rolesFor("manageTemplates"));
  const id = str(formData, "id");
  const t = await db.roleTemplate.findUnique({ where: { id }, include: { _count: { select: { requests: true } } } });
  if (!t) redirect("/templates");
  if (t._count.requests > 0) redirect("/templates?error=This+role+is+used+by+existing+requests+and+can't+be+deleted.");
  await db.roleTemplate.delete({ where: { id } });
  await audit(s, "TEMPLATE_DELETED", null, t.name);
  revalidatePath("/templates");
  redirect("/templates");
}
