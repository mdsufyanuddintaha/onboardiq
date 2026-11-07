"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { rolesFor } from "@/lib/perm";
import { audit } from "@/lib/audit";
import { safeNext } from "@/lib/format";
import { CATEGORIES, MAX_BYTES, cleanName, contentMatches, extOf, mimeFor, removeFile, saveEncrypted } from "@/lib/vault";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData, fallback: string) => safeNext(str(f, "returnTo"), fallback);
const withError = (path: string, msg: string) => `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`;

export async function uploadDocumentAction(formData: FormData) {
  const s = await requireRole(...rolesFor("docsUpload"));
  const requestId = str(formData, "requestId");
  const category = str(formData, "category");
  const file = formData.get("file");
  const dest = `/requests/${requestId}`;

  if (!(file instanceof File) || file.size === 0) redirect(withError(dest, "Choose a file to upload."));
  if (!CATEGORIES.includes(category)) redirect(withError(dest, "Choose a document category."));
  if (file.size > MAX_BYTES) redirect(withError(dest, "Files can be up to 10 MB."));
  const name = cleanName(file.name);
  const ext = extOf(name);
  const mime = mimeFor(ext);
  if (!mime) redirect(withError(dest, "Allowed types: PDF, PNG, JPG, DOCX, XLSX and TXT."));
  const req = await db.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!req) redirect("/requests");

  const buf = Buffer.from(await file.arrayBuffer());
  if (!contentMatches(ext, buf)) {
    await audit(s, "DOCUMENT_REJECTED", requestId, `${name}: content doesn't match .${ext}`);
    redirect(withError(dest, `That file's contents don't look like a .${ext} file.`));
  }
  const { storedName, sha256 } = await saveEncrypted(buf);
  const doc = await db.document.create({
    data: { requestId, category, originalName: name, mimeType: mime, size: buf.length, storedName, sha256, uploadedBy: s.username },
  });
  await audit(s, "DOCUMENT_UPLOADED", requestId, `${doc.originalName} (${category}, sha256 ${sha256.slice(0, 12)}…)`);
  revalidatePath(dest);
  redirect(dest);
}

const HOURS = [1, 24, 168];
const LIMITS = [1, 3, 10];

export async function createShareLinkAction(formData: FormData) {
  const s = await requireRole(...rolesFor("docsManage"));
  const documentId = str(formData, "documentId");
  const hours = Number(str(formData, "hours"));
  const maxDownloads = Number(str(formData, "maxDownloads"));
  const dest = back(formData, "/documents");

  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.deletedAt) redirect(withError(dest, "That document no longer exists."));
  if (!HOURS.includes(hours) || !LIMITS.includes(maxDownloads)) redirect(withError(dest, "Choose an expiry and a download limit."));

  const token = randomBytes(24).toString("base64url");
  await db.shareLink.create({
    data: { token, documentId, createdBy: s.username, expiresAt: new Date(Date.now() + hours * 3_600_000), maxDownloads },
  });
  await audit(s, "SHARE_LINK_CREATED", doc.requestId, `${doc.originalName}: ${hours}h, ${maxDownloads} download(s)`);
  // Shown once to the creator, never stored in the page
  cookies().set("oiq_share", `/share/${token}`, { httpOnly: true, path: "/", maxAge: 60, sameSite: "lax" });
  revalidatePath(dest);
  redirect(dest);
}

export async function revokeShareLinkAction(formData: FormData) {
  const s = await requireRole(...rolesFor("docsManage"));
  const id = str(formData, "id");
  const dest = back(formData, "/documents");
  const link = await db.shareLink.findUnique({ where: { id }, include: { document: true } });
  if (!link) redirect(dest);
  await db.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit(s, "SHARE_LINK_REVOKED", link.document.requestId, link.document.originalName);
  revalidatePath(dest);
  redirect(dest);
}

export async function deleteDocumentAction(formData: FormData) {
  const s = await requireRole(...rolesFor("docsManage"));
  const id = str(formData, "id");
  const dest = back(formData, "/documents");
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.deletedAt) redirect(dest);
  await removeFile(doc.storedName);
  const now = new Date();
  await db.document.update({ where: { id }, data: { deletedAt: now } });
  await db.shareLink.updateMany({ where: { documentId: id, revokedAt: null }, data: { revokedAt: now } });
  await audit(s, "DOCUMENT_DELETED", doc.requestId, doc.originalName);
  revalidatePath(dest);
  redirect(dest);
}
