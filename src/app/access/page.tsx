import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { fmtDate } from "@/lib/format";
import { PageHeader, Panel, Pager, Empty, AccessBadge, PriorityBadge, ACCESS_STATUS_OPTIONS, parsePage } from "@/components/ui";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Access requests" };
const PAGE = 10;

export default async function AccessList({ searchParams }: { searchParams: { q?: string; status?: string; page?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");

  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const status = ACCESS_STATUS_OPTIONS.some((o) => o.value === searchParams.status) ? searchParams.status : undefined;
  const page = parsePage(searchParams.page);

  const where: Prisma.AccessRequestWhereInput = {};
  if (status) where.status = status as Prisma.AccessRequestWhereInput["status"];
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { employee: { contains: q, mode: "insensitive" } },
      { groupName: { contains: q, mode: "insensitive" } },
      { requestedBy: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.accessRequest.count({ where }),
    db.accessRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { _count: { select: { comments: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const filtered = !!(q || status);

  return (
    <>
      <PageHeader title="Access requests" sub="Ask for an extra AD group for an existing employee. A different manager approves it, then IT grants it.">
        {can(s, "createAccess") && (
          <Link href="/access/new" className="btn primary">
            <Icon name="plus" size={16} />
            New request
          </Link>
        )}
      </PageHeader>

      <Panel flush>
        <form className="filters" method="get" role="search">
          <div className="search">
            <Icon name="search" size={16} />
            <input className="input" name="q" defaultValue={q} placeholder="Search title, employee or group" aria-label="Search access requests" />
          </div>
          <select className="select" name="status" defaultValue={status ?? ""} aria-label="Filter by status">
            <option value="">All statuses</option>
            {ACCESS_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="btn" type="submit">Apply</button>
          {filtered && <Link href="/access" className="btn ghost">Clear</Link>}
        </form>

        {rows.length === 0 ? (
          <Empty icon="key" title={filtered ? "No access requests match those filters" : "No access requests yet"}>
            {filtered ? "Try a different search or clear the filters." : can(s, "createAccess") ? "Create one when someone needs access beyond their role." : "HR and managers create requests here."}
          </Empty>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr><th>Request</th><th>Employee</th><th>AD group</th><th>Priority</th><th>Status</th><th>Requested by</th><th>Created</th></tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/access/${a.id}`} className="row-link cell-person">
                        <span>
                          <div className="name">{a.title}</div>
                          <div className="sub">#{a.number}{a._count.comments ? ` · ${a._count.comments} comment${a._count.comments === 1 ? "" : "s"}` : ""}</div>
                        </span>
                      </Link>
                    </td>
                    <td className="mono">{a.employee}</td>
                    <td><span className="chip">{a.groupName}</span></td>
                    <td><PriorityBadge priority={a.priority} /></td>
                    <td><AccessBadge status={a.status} /></td>
                    <td className="muted">{a.requestedBy}</td>
                    <td className="muted nowrap">{fmtDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pages={pages} total={total} noun={total === 1 ? "request" : "requests"} base="/access" params={{ q, status }} />
      </Panel>
    </>
  );
}
