import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can, ROLE_LABEL } from "@/lib/perm";
import { fmtDateTime, label } from "@/lib/format";
import { PageHeader, Panel, Pager, Empty, ActionBadge, parsePage } from "@/components/ui";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 25;

export default async function AuditPage({ searchParams }: { searchParams: { q?: string; action?: string; page?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login?next=/audit");
  if (!can(s, "viewAudit")) redirect("/");

  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const page = parsePage(searchParams.page);

  const kinds = await db.auditEvent.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { action: "asc" } });
  const action = kinds.some((k) => k.action === searchParams.action) ? searchParams.action : undefined;

  const where: Prisma.AuditEventWhereInput = {};
  if (action) where.action = action;
  if (q) {
    where.OR = [
      { actor: { contains: q, mode: "insensitive" } },
      { detail: { contains: q, mode: "insensitive" } },
      { action: { contains: q.replace(/\s+/g, "_"), mode: "insensitive" } },
    ];
  }

  const [total, events] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const filtered = !!(q || action);

  return (
    <>
      <PageHeader title="Audit log" sub="An append-only record of every sign-in, approval, account change and document access.">
        {can(s, "exportData") && (
          <a className="btn" href="/api/export/audit">
            <Icon name="download" size={16} />
            Export CSV
          </a>
        )}
      </PageHeader>

      <div className="stack">
        <Panel flush>
          <form className="filters" method="get" role="search">
            <div className="search">
              <Icon name="search" size={16} />
              <input className="input" name="q" defaultValue={q} placeholder="Search by person, event or detail" aria-label="Search the audit log" />
            </div>
            <select className="select" name="action" defaultValue={action ?? ""} aria-label="Filter by event">
              <option value="">All events</option>
              {kinds.map((k) => (
                <option key={k.action} value={k.action}>{label(k.action)} ({k._count._all})</option>
              ))}
            </select>
            <button className="btn" type="submit">Apply</button>
            {filtered && <Link href="/audit" className="btn ghost">Clear</Link>}
          </form>

          {events.length === 0 ? (
            <Empty icon="shield" title={filtered ? "No events match those filters" : "Nothing has been logged yet"}>
              {filtered ? "Try a different search or clear the filters." : "Events appear here as people sign in and work."}
            </Empty>
          ) : (
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr><th>When</th><th>Who</th><th>Event</th><th>Detail</th><th><span className="sr-only">Related record</span></th></tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td className="muted nowrap">{fmtDateTime(e.createdAt)}</td>
                      <td>
                        <div className="name">{e.actor}</div>
                        <div className="sub">{e.actorRole === "NONE" ? "Not signed in" : e.actorRole.split(",").map((r) => ROLE_LABEL[r] ?? r).join(", ")}</div>
                      </td>
                      <td><ActionBadge action={e.action} /></td>
                      <td className="muted">{e.detail ?? "—"}</td>
                      <td className="right nowrap">
                        {e.requestId && <Link className="link" href={`/requests/${e.requestId}`}>Onboarding</Link>}
                        {e.accessRequestId && <Link className="link" href={`/access/${e.accessRequestId}`}>Access request</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pages={pages} total={total} noun={total === 1 ? "event" : "events"} base="/audit" params={{ q, action }} />
        </Panel>

        {can(s, "exportData") && (
          <Panel title="Data feeds" sub="CSV files for the SQL Server warehouse and Power BI. Each export is logged here too.">
            <div className="btn-row">
              <a className="btn" href="/api/export/audit"><Icon name="download" size={16} />Audit events</a>
              <a className="btn" href="/api/export/requests"><Icon name="download" size={16} />Onboarding requests</a>
              <a className="btn" href="/api/export/access"><Icon name="download" size={16} />Access requests</a>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
