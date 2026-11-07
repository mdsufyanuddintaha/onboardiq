import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { audit } from "@/lib/audit";
import { fileResponse, readDecrypted } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Authenticated download. Role-checked on the server and logged every time.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new Response("Sign in to download documents.", { status: 401 });
  if (!can(s, "docsDownload")) return new Response("Your role can't download documents.", { status: 403 });

  const doc = await db.document.findUnique({ where: { id: params.id } });
  if (!doc || doc.deletedAt) return new Response("Document not found.", { status: 404 });

  let buf: Buffer;
  try {
    buf = await readDecrypted(doc.storedName);
  } catch {
    await audit(s, "DOCUMENT_DOWNLOAD_FAILED", doc.requestId, `${doc.originalName}: file missing or failed its integrity check`);
    return new Response("This file couldn't be decrypted. It may be missing or damaged.", { status: 500 });
  }

  await audit(s, "DOCUMENT_DOWNLOADED", doc.requestId, doc.originalName);
  return fileResponse(buf, doc.originalName, doc.mimeType);
}
