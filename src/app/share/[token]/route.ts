import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { audit } from "@/lib/audit";
import { fileResponse, messagePage, readDecrypted } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Expiring, download-limited link. The viewer still has to be signed in as HR or a manager.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return messagePage("Link not found", "This link isn't valid.", 404);

  const s = await getSession();
  if (!s) return new Response(null, { status: 302, headers: { Location: `/login?next=${encodeURIComponent(`/share/${token}`)}` } });
  if (!can(s, "docsDownload")) return messagePage("No access", "Your role can't open shared documents. Ask HR or a manager.", 403);

  const link = await db.shareLink.findUnique({ where: { token }, include: { document: true } });
  if (!link || link.document.deletedAt) return messagePage("Link not found", "This link doesn't exist or its document was deleted.", 404);
  if (link.revokedAt) return messagePage("Link revoked", "The person who shared this document turned the link off.", 410);
  const now = new Date();
  if (link.expiresAt <= now) return messagePage("Link expired", "This link has expired. Ask HR for a new one.", 410);

  // Claim one download atomically so two people can't both use the last one.
  const claimed = await db.shareLink.updateMany({
    where: { id: link.id, revokedAt: null, expiresAt: { gt: now }, downloads: { lt: link.maxDownloads } },
    data: { downloads: { increment: 1 } },
  });
  if (claimed.count === 0) return messagePage("Download limit reached", "This link has been used the maximum number of times.", 410);

  let buf: Buffer;
  try {
    buf = await readDecrypted(link.document.storedName);
  } catch {
    await db.shareLink.update({ where: { id: link.id }, data: { downloads: { decrement: 1 } } });
    await audit(s, "DOCUMENT_DOWNLOAD_FAILED", link.document.requestId, `${link.document.originalName} (share link): file missing or failed its integrity check`);
    return messagePage("Couldn't open the file", "The file is missing or damaged. Tell HR.", 500);
  }

  await audit(s, "DOCUMENT_DOWNLOADED", link.document.requestId, `${link.document.originalName} (share link, ${link.downloads + 1} of ${link.maxDownloads})`);
  return fileResponse(buf, link.document.originalName, link.document.mimeType);
}
