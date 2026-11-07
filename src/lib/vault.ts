import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export const VAULT_DIR = process.env.VAULT_DIR || path.join(process.cwd(), ".vault");
export const MAX_BYTES = 10 * 1024 * 1024;
export const CATEGORIES = ["Offer letter", "ID / I-9", "Tax form", "Contract", "Policy acknowledgment", "Other"];

export const ALLOWED: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

// Checks the file's real signature, not just its extension.
export function signatureOk(ext: string, b: Buffer) {
  const hex = b.subarray(0, 4).toString("hex");
  switch (ext) {
    case "pdf":
      return b.subarray(0, 4).toString("latin1") === "%PDF";
    case "png":
      return hex === "89504e47";
    case "jpg":
    case "jpeg":
      return hex.startsWith("ffd8ff");
    case "docx":
    case "xlsx":
      return hex === "504b0304";
    case "txt":
      return !b.includes(0);
    default:
      return false;
  }
}

// FILE_ENCRYPTION_KEY (64 hex chars) is preferred. Otherwise a key is derived from SESSION_SECRET.
function key(): Buffer {
  const k = process.env.FILE_ENCRYPTION_KEY;
  if (k && /^[0-9a-f]{64}$/i.test(k)) return Buffer.from(k, "hex");
  const secret = process.env.SESSION_SECRET || "dev-only-secret-change-me";
  return scryptSync(secret, "onboardiq-vault", 32);
}

export async function saveEncrypted(buf: Buffer): Promise<{ storedName: string; sha256: string }> {
  await fs.mkdir(VAULT_DIR, { recursive: true });
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  const tag = c.getAuthTag();
  const storedName = randomBytes(16).toString("hex") + ".bin";
  await fs.writeFile(path.join(VAULT_DIR, storedName), Buffer.concat([iv, tag, enc]), { mode: 0o600 });
  return { storedName, sha256: createHash("sha256").update(buf).digest("hex") };
}

const NAME_RE = /^[0-9a-f]{32}\.bin$/;

export async function readDecrypted(storedName: string): Promise<Buffer> {
  if (!NAME_RE.test(storedName)) throw new Error("Invalid stored name");
  const raw = await fs.readFile(path.join(VAULT_DIR, storedName));
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag); // GCM also detects tampering: a modified file fails to decrypt
  return Buffer.concat([d.update(enc), d.final()]);
}

export async function removeStored(storedName: string) {
  if (!NAME_RE.test(storedName)) return;
  await fs.rm(path.join(VAULT_DIR, storedName), { force: true });
}

export function safeFilename(name: string) {
  return name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file";
}

// Helpers used by the upload action
export const cleanName = safeFilename;
export const removeFile = removeStored;
export const contentMatches = signatureOk;
export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
export const mimeFor = (ext: string): string | null => ALLOWED[ext] ?? null;

// Download response: forced attachment, no sniffing, no caching, and sandboxed if ever opened inline.
export function fileResponse(buf: Buffer, name: string, mime: string): Response {
  const safe = safeFilename(name);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}

// Small standalone page for share-link problems (expired, used up, revoked)
export function messagePage(title: string, body: string, status: number): Response {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · OnboardIQ</title><style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:Canvas;color:CanvasText}main{max-width:420px;padding:32px}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;opacity:.75}a{color:inherit;font-weight:600}</style></head><body><main><h1>${esc(title)}</h1><p>${esc(body)}</p><a href="/">Back to OnboardIQ</a></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
