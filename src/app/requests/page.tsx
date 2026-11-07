import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { fmtDate } from "@/lib/format";
import { PageHeader, Panel, Pager, Empty, Avatar, StatusBadge, REQUEST_STATUS_OPTIONS, parsePage } from "@/components/ui";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Onboarding" };
const PAGE = 10;

export default async function Requests({ searchParams }: { searchParams: { q?: string; status?: string; page?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");

  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const status = REQUEST_STATUS_OPTIONS.some((o) => o.value === searchParams.status) ? searchParams.status : undefined;
  const page = parsePage(searchParams.page);

  const where: Prisma.RequestWhereInput = {};
  if (status) where.status = status as Prisma.RequestWhereInput["status"];
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { username: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { department: { contains: q, mode: "insensitive" } },
      { jobTitle: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.request.count({ where }),
    db.request.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { roleTemplate: { select: { name: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const filtered = !!(q || status);

  return (
    <>
      <PageHeader title="Onboarding" sub="New hire requests from submission to offboarding.">
        {can(s, "createRequest") && (
          <Link href="/requests/new" className="btn primary">
            <Icon name="plus" size={16} />
            New hire
          </Link>
        )}
      </PageHeader>

      <Panel flush>
        <form className="filters" method="get" role="search">
          <div className="search">
            <Icon name="search" size={16} />
            <input className="input" name="q" defaultValue={q} placeholder="Search name, username, email or department" aria-label="Search requests" />
          </div>
          <select className="select" name="status" defaultValue={status ?? ""} aria-label="Filter by status">
            <option value="">All statuses</option>
            {REQUEST_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="btn" type="submit">Apply</button>
          {filtered && <Link href="/requests" className="btn ghost">Clear</Link>}
        </form>

        {rows.length === 0 ? (
          <Empty icon="users" title={filtered ? "No requests match those filters" : "No new hire requests yet"}>
            {filtered ? "Try a different search or clear the filters." : can(s, "createRequest") ? "Start with a new hire request." : "HR creates requests; they will appear here."}
          </Empty>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr><th>Employee</th><th>Role</th><th>Department</th><th>Status</th><th>Requested by</th><th>Created</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/requests/${r.id}`} className="row-link cell-person">
                        <Avatar name={`${r.firstName} ${r.lastName}`} />
                        <span>
                          <div className="name">{r.firstName} {r.lastName}</div>
                          <div className="sub">{r.username}</div>
                        </span>
                      </Link>
                    </td>
                    <td>{r.roleTemplate.name}</td>
                    <td className="muted">{r.department}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="muted">{r.requestedBy}</td>
                    <td className="muted nowrap">{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pages={pages} total={total} noun={total === 1 ? "request" : "requests"} base="/requests" params={{ q, status }} />
      </Panel>
    </>
  );
}
