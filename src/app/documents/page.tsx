import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { fmtBytes, relTime } from "@/lib/format";
import { CATEGORIES } from "@/lib/vault";
import { revokeShareLinkAction } from "../doc-actions";
import { PageHeader, Panel, Pager, Empty, Alert, Badge, parsePage } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Document vault" };
const PAGE = 10;

export default async function Documents({ searchParams }: { searchParams: { q?: string; category?: string; page?: string; error?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login?next=/documents");
  if (!can(s, "docsView")) redirect("/");

  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const category = CATEGORIES.includes(searchParams.category ?? "") ? searchParams.category : undefined;
  const page = parsePage(searchParams.page);
  const now = new Date();

  const where: Prisma.DocumentWhereInput = { deletedAt: null };
  if (category) where.category = category;
  if (q) {
    where.OR = [
      { originalName: { contains: q, mode: "insensitive" } },
      { uploadedBy: { contains: q, mode: "insensitive" } },
      { request: { firstName: { contains: q, mode: "insensitive" } } },
      { request: { lastName: { contains: q, mode: "insensitive" } } },
      { request: { username: { contains: q, mode: "insensitive" } } },
    ];
  }
  const liveLink: Prisma.ShareLinkWhereInput = { revokedAt: null, expiresAt: { gt: now } };

  const [total, docs, totals, links] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { request: { select: { id: true, firstName: true, lastName: true, username: true } } },
    }),
    db.document.aggregate({ where: { deletedAt: null }, _count: { _all: true }, _sum: { size: true } }),
    db.shareLink.findMany({
      where: { ...liveLink, document: { deletedAt: null } },
      orderBy: { expiresAt: "asc" },
      include: { document: { select: { originalName: true, request: { select: { id: true, firstName: true, lastName: true } } } } },
    }),
  ]);
  const activeLinks = links.filter((l) => l.downloads < l.maxDownloads);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const filtered = !!(q || category);

  return (
    <>
      <PageHeader title="Document vault" sub="HR paperwork for every new hire, encrypted at rest. Open an onboarding record to upload or share." />

      <div className="stack">
        {searchParams.error && <Alert tone="bad">{searchParams.error}</Alert>}

        <div className="metrics">
          <div className="metric">
            <div className="metric-value">{totals._count._all}</div>
            <div className="metric-label">Documents</div>
            <div className="metric-note">{fmtBytes(totals._sum.size ?? 0)} stored</div>
          </div>
          <div className="metric">
            <div className="metric-value">{activeLinks.length}</div>
            <div className="metric-label">Active share links</div>
            <div className="metric-note">Expiring and download-limited</div>
          </div>
          <div className="metric">
            <div className="metric-value">AES-256</div>
            <div className="metric-label">Encryption at rest</div>
            <div className="metric-note">Tamper-evident (GCM)</div>
          </div>
        </div>

        <Panel flush>
          <form className="filters" method="get" role="search">
            <div className="search">
              <Icon name="search" size={16} />
              <input className="input" name="q" defaultValue={q} placeholder="Search file name, employee or uploader" aria-label="Search documents" />
            </div>
            <select className="select" name="category" defaultValue={category ?? ""} aria-label="Filter by category">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn" type="submit">Apply</button>
            {filtered && <Link href="/documents" className="btn ghost">Clear</Link>}
          </form>

          {docs.length === 0 ? (
            <Empty icon="lock" title={filtered ? "No documents match those filters" : "The vault is empty"}>
              {filtered ? "Try a different search or clear the filters." : "Open a new hire's record and upload their paperwork there."}
            </Empty>
          ) : (
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr><th>Document</th><th>Employee</th><th>Category</th><th>Size</th><th>Uploaded</th><th><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="name">{d.originalName}</div>
                        <div className="sub mono">sha256 {d.sha256.slice(0, 12)}…</div>
                      </td>
                      <td>
                        <Link href={`/requests/${d.request.id}`} className="link">{d.request.firstName} {d.request.lastName}</Link>
                        <div className="sub">{d.request.username}</div>
                      </td>
                      <td><Badge>{d.category}</Badge></td>
                      <td className="muted nowrap">{fmtBytes(d.size)}</td>
                      <td className="muted">{d.uploadedBy}<div className="sub">{relTime(d.createdAt)}</div></td>
                      <td className="right nowrap">
                        {can(s, "docsDownload") && (
                          <a className="btn sm" href={`/api/documents/${d.id}`}>
                            <Icon name="download" size={15} />
                            Download
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pages={pages} total={total} noun={total === 1 ? "document" : "documents"} base="/documents" params={{ q, category }} />
        </Panel>

        {can(s, "docsManage") && (
          <Panel title="Active share links" sub="Links stop working when they expire, run out of downloads, or are revoked." flush>
            {activeLinks.length === 0 ? (
              <Empty icon="link" small title="No active links">Create one from a document on an onboarding record.</Empty>
            ) : (
              <div className="tablewrap">
                <table className="table">
                  <thead>
                    <tr><th>Document</th><th>Employee</th><th>Expires</th><th>Downloads</th><th>Created by</th><th><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {activeLinks.map((l) => (
                      <tr key={l.id}>
                        <td>{l.document.originalName}</td>
                        <td className="muted">{l.document.request.firstName} {l.document.request.lastName}</td>
                        <td className="muted nowrap">{relTime(l.expiresAt)}</td>
                        <td className="muted nowrap">{l.downloads} of {l.maxDownloads}</td>
                        <td className="muted">{l.createdBy}</td>
                        <td className="right">
                          <form action={revokeShareLinkAction} className="inline-form">
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="returnTo" value="/documents" />
                            <SubmitButton variant="danger" size="sm" confirm="Revoke this link? It stops working immediately.">Revoke</SubmitButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
