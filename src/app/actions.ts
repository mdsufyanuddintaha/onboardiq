"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authenticate, provisionUser, disableUser } from "@/lib/ldap";
import { createSession, destroySession, getSession, requireRole } from "@/lib/session";
import { rolesFor } from "@/lib/perm";
import { audit, auditAnon } from "@/lib/audit";
import { safeNext, zonedToUtc } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// Basic brute-force throttle (per username, in memory)
const fails = new Map<string, { n: number; until: number }>();

export async function loginAction(formData: FormData) {
  const username = str(formData, "username").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(str(formData, "next"));
  const back = (msg: string) => `/login?error=${encodeURIComponent(msg)}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`;

  const f = fails.get(username);
  if (f && f.until > Date.now()) redirect(back("Too many attempts. Try again in a few minutes."));

  let user: Awaited<ReturnType<typeof authenticate>> = null;
  try {
    user = await authenticate(username, password);
  } catch (e) {
    await auditAnon(username, "LOGIN_ERROR", e instanceof Error ? e.message : "directory error");
    redirect(back("The directory is unavailable. Try again shortly."));
  }
  if (!user) {
    const n = (f?.n ?? 0) + 1;
    fails.set(username, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    await auditAnon(username, "LOGIN_FAILED");
    redirect(back("Wrong username or password, or this account has no OnboardIQ role."));
  }
  fails.delete(username);
  await createSession(user);
  await audit(user, "LOGIN_SUCCESS");
  redirect(next);
}

export async function logoutAction() {
  const s = await getSession();
  if (s) await audit(s, "LOGOUT");
  destroySession();
  redirect("/login");
}

export async function createRequestAction(formData: FormData) {
  const s = await requireRole(...rolesFor("createRequest"));
  const firstName = str(formData, "firstName");
  const lastName = str(formData, "lastName");
  const username = str(formData, "username").toLowerCase();
  const email = str(formData, "email");
  const jobTitle = str(formData, "jobTitle");
  const roleTemplateId = str(formData, "roleTemplateId");
  const startDate = str(formData, "startDate");

  if (!firstName || !lastName || !email || !jobTitle || !startDate) redirect("/requests/new?error=Fill+in+every+field.");
  if (!/^[a-z][a-z0-9.]{2,19}$/.test(username)) redirect("/requests/new?error=Username+must+be+3-20+characters:+lowercase+letters,+digits+and+dots.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/requests/new?error=Enter+a+valid+email+address.");
  if (isNaN(new Date(startDate).getTime())) redirect("/requests/new?error=Enter+a+valid+start+date.");
  const tpl = await db.roleTemplate.findUnique({ where: { id: roleTemplateId } });
  if (!tpl) redirect("/requests/new?error=Choose+a+role+template.");
  if (await db.request.findUnique({ where: { username } })) redirect("/requests/new?error=That+username+already+has+a+request.");

  const r = await db.request.create({
    data: { firstName, lastName, username, email, jobTitle, department: tpl.department, startDate: new Date(startDate), roleTemplateId, requestedBy: s.username },
  });
  await audit(s, "REQUEST_CREATED", r.id, `${username} as ${tpl.name}`);
  revalidatePath("/");
  redirect(`/requests/${r.id}`);
}

// Manager approval triggers automatic AD provisioning.
export async function approveRequestAction(formData: FormData) {
  const s = await requireRole(...rolesFor("decideRequest"));
  const id = str(formData, "id");
  const r = await db.request.findUnique({ where: { id }, include: { roleTemplate: true } });
  if (!r || !["PENDING_APPROVAL", "PROVISION_FAILED"].includes(r.status)) redirect(`/requests/${id}?error=This+request+is+not+waiting+for+approval.`);
  // Separation of duties
  if (r.requestedBy === s.username) {
    await audit(s, "APPROVAL_DENIED_SELF", id);
    redirect(`/requests/${id}?error=You+can't+approve+your+own+request.`);
  }
  await audit(s, "REQUEST_APPROVED", id);
  await db.request.update({ where: { id }, data: { approvedBy: s.username, approvedAt: new Date() } });

  try {
    const { tempPassword } = await provisionUser(r, r.roleTemplate.adGroups);
    await db.request.update({ where: { id }, data: { status: "PROVISIONED", provisionedAt: new Date(), failureNote: null } });
    await audit(s, "ACCOUNT_CREATED", id, `groups: ${r.roleTemplate.adGroups.join(", ")}`);
    // One-time display for the approver; never stored in the database
    cookies().set("oiq_flash", `Temporary password for ${r.username}: ${tempPassword}`, { httpOnly: true, path: "/", maxAge: 60, sameSite: "lax" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await db.request.update({ where: { id }, data: { status: "PROVISION_FAILED", failureNote: msg } });
    await audit(s, "PROVISION_FAILED", id, msg);
  }
  revalidatePath("/");
  redirect(`/requests/${id}`);
}

export async function rejectRequestAction(formData: FormData) {
  const s = await requireRole(...rolesFor("decideRequest"));
  const id = str(formData, "id");
  const note = str(formData, "note").slice(0, 300);
  const r = await db.request.findUnique({ where: { id } });
  if (!r || r.status !== "PENDING_APPROVAL") redirect(`/requests/${id}?error=This+request+is+not+waiting+for+approval.`);
  if (r.requestedBy === s.username) redirect(`/requests/${id}?error=You+can't+decide+your+own+request.`);
  await db.request.update({ where: { id }, data: { status: "REJECTED", approvedBy: s.username, rejectionNote: note || null } });
  await audit(s, "REQUEST_REJECTED", id, note);
  revalidatePath("/");
  redirect(`/requests/${id}`);
}

// HR schedules offboarding with a deadline; IT then disables the account.
export async function scheduleOffboardAction(formData: FormData) {
  const s = await requireRole(...rolesFor("scheduleOffboard"));
  const id = str(formData, "id");
  const due = zonedToUtc(str(formData, "dueDisableAt"));
  const r = await db.request.findUnique({ where: { id } });
  if (!r || r.status !== "PROVISIONED") redirect(`/requests/${id}?error=Only+active+accounts+can+be+scheduled+for+offboarding.`);
  if (!due) redirect(`/requests/${id}?error=Choose+a+date+and+time+for+the+deadline.`);
  await db.request.update({ where: { id }, data: { status: "OFFBOARD_SCHEDULED", dueDisableAt: due } });
  await audit(s, "OFFBOARD_SCHEDULED", id, `due ${due.toISOString()}`);
  revalidatePath("/");
  redirect(`/requests/${id}`);
}

export async function disableAccountAction(formData: FormData) {
  const s = await requireRole(...rolesFor("disableAccount"));
  const id = str(formData, "id");
  const r = await db.request.findUnique({ where: { id }, include: { roleTemplate: true } });
  if (!r || r.status !== "OFFBOARD_SCHEDULED") redirect(`/requests/${id}?error=This+account+is+not+scheduled+for+offboarding.`);
  try {
    await disableUser(r.username, r.roleTemplate.adGroups);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await audit(s, "DISABLE_FAILED", id, msg);
    redirect(`/requests/${id}?error=${encodeURIComponent("Couldn't disable the account: " + msg)}`);
  }
  const now = new Date();
  await db.request.update({ where: { id }, data: { status: "DISABLED", disabledAt: now } });
  const late = r.dueDisableAt && now > r.dueDisableAt;
  await audit(s, late ? "ACCOUNT_DISABLED_LATE" : "ACCOUNT_DISABLED_ON_TIME", id);
  revalidatePath("/");
  redirect(`/requests/${id}`);
}
