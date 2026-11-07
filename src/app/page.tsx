import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasRole } from "@/lib/session";
import { can } from "@/lib/perm";
import { fmtDuration, label, relTime } from "@/lib/format";
import { PageHeader, Panel, Empty, Avatar, StatusBadge, actionTone, type Tone } from "@/components/ui";
import Icon, { type IconName } from "@/components/Icon";
import { ColumnChart, HBars, Pipeline, SplitMeter } from "@/components/Charts";

const DAY = 86_400_000;

type Attn = { title: string; sub: string; href: string; tone: Tone; icon: IconName; tag: string };

export default async function Overview() {
  const s = await getSession();
  if (!s) redirect("/login");
  const now = new Date();

  const [requests, access, docCount, events] = await Promise.all([
    db.request.findMany({ orderBy: { createdAt: "desc" }, include: { roleTemplate: { select: { name: true } } } }),
    db.accessRequest.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, employee: true, groupName: true, status: true, requestedBy: true, createdAt: true } }),
    can(s, "docsView") ? db.document.count({ where: { deletedAt: null } }) : Promise.resolve(0),
    can(s, "viewAudit") ? db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 7 }) : Promise.resolve([]),
  ]);

  const by = (st: string) => requests.filter((r) => r.status === st);
  const pending = by("PENDING_APPROVAL");
  const active = by("PROVISIONED");
  const scheduled = by("OFFBOARD_SCHEDULED");
  const disabled = by("DISABLED");
  const problem = [...by("REJECTED"), ...by("PROVISION_FAILED")];
  const overdue = scheduled.filter((r) => r.dueDisableAt && r.dueDisableAt < now);
  const provisioned = requests.filter((r) => r.provisionedAt);
  const avgMs = provisioned.length ? provisioned.reduce((a, r) => a + (r.provisionedAt!.getTime() - r.createdAt.getTime()), 0) / provisioned.length : null;
  const onTime = requests.filter((r) => r.disabledAt && r.dueDisableAt && r.disabledAt <= r.dueDisableAt).length;
  const late = requests.filter((r) => r.disabledAt && r.dueDisableAt && r.disabledAt > r.dueDisableAt).length;
  const accessOpen = access.filter((a) => a.status === "OPEN");
  const accessApproved = access.filter((a) => a.status === "APPROVED");
  const oldestPending = pending.length ? pending[pending.length - 1] : null;

  // Requests created per week, last 8 weeks (weeks start Monday, UTC)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thisWeek = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = thisWeek - (7 - i) * 7 * DAY;
    return { start, label: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), value: 0 };
  });
  for (const r of requests) {
    const t = r.createdAt.getTime();
    const w = weeks.find((x) => t >= x.start && t < x.start + 7 * DAY);
    if (w) w.value++;
  }

  const deptMap = new Map<string, number>();
  for (const r of requests) deptMap.set(r.department, (deptMap.get(r.department) ?? 0) + 1);
  const depts = Array.from(deptMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  // What this person should do next
  const attn: Attn[] = [];
  if (hasRole(s, "MANAGER")) {
    for (const r of pending.filter((r) => r.requestedBy !== s.username).slice(0, 4))
      attn.push({ title: `Approve ${r.firstName} ${r.lastName}`, sub: `${r.roleTemplate.name} · requested ${relTime(r.createdAt)} by ${r.requestedBy}`, href: `/requests/${r.id}`, tone: "warn", icon: "userPlus", tag: "Onboarding" });
    for (const a of accessOpen.filter((a) => a.requestedBy !== s.username).slice(0, 3))
      attn.push({ title: `Review access request #${a.number}`, sub: `${a.groupName} for ${a.employee} · ${relTime(a.createdAt)}`, href: `/access/${a.id}`, tone: "warn", icon: "key", tag: "Access" });
  }
  if (hasRole(s, "IT")) {
    for (const r of scheduled.slice(0, 4)) {
      const isLate = !!r.dueDisableAt && r.dueDisableAt < now;
      attn.push({ title: `Disable ${r.firstName} ${r.lastName}`, sub: r.dueDisableAt ? `Deadline ${relTime(r.dueDisableAt)}` : "Offboarding scheduled", href: `/requests/${r.id}`, tone: isLate ? "bad" : "info", icon: "clock", tag: isLate ? "Overdue" : "Offboarding" });
    }
    for (const a of accessApproved.slice(0, 3))
      attn.push({ title: `Grant ${a.groupName} to ${a.employee}`, sub: `Request #${a.number} approved`, href: `/access/${a.id}`, tone: "info", icon: "key", tag: "Access" });
  }
  if (hasRole(s, "HR")) {
    for (const r of by("PROVISION_FAILED").slice(0, 4))
      attn.push({ title: `Provisioning failed for ${r.firstName} ${r.lastName}`, sub: r.failureNote ?? "Ask the approver to retry", href: `/requests/${r.id}`, tone: "bad", icon: "alert", tag: "Failed" });
  }
  if (hasRole(s, "AUDITOR") && (late > 0 || overdue.length > 0)) {
    attn.push({ title: `${late} account${late === 1 ? "" : "s"} disabled after the deadline`, sub: "Review the audit trail for late offboarding", href: "/audit?action=ACCOUNT_DISABLED_LATE", tone: "bad", icon: "shield", tag: "Audit" });
  }

  const first = s.name.split(" ")[0];

  return (
    <>
      <PageHeader title="Overview" sub={`Welcome back, ${first}. Here's where onboarding and access stand right now.`}>
        {can(s, "createRequest") && (
          <Link href="/requests/new" className="btn primary">
            <Icon name="plus" size={16} />
            New hire
          </Link>
        )}
        {can(s, "createAccess") && (
          <Link href="/access/new" className="btn">
            <Icon name="key" size={16} />
            Request access
          </Link>
        )}
      </PageHeader>

      <div className="stack">
        <div className="metrics">
          <div className="metric">
            <div className="metric-value">{pending.length}</div>
            <div className="metric-label">Awaiting approval</div>
            <div className="metric-note">{oldestPending ? `Oldest ${relTime(oldestPending.createdAt)}` : "Nothing waiting"}</div>
          </div>
          <div className="metric">
            <div className="metric-value">{active.length + scheduled.length}</div>
            <div className="metric-label">Active accounts</div>
            <div className="metric-note">{scheduled.length} scheduled to leave</div>
          </div>
          <div className="metric">
            <div className="metric-value">{avgMs === null ? "—" : fmtDuration(avgMs)}</div>
            <div className="metric-label">Time to provision</div>
            <div className="metric-note">Request to account, average</div>
          </div>
          <div className={"metric" + (overdue.length ? " bad" : "")}>
            <div className="metric-value">{overdue.length}</div>
            <div className="metric-label">Offboarding overdue</div>
            <div className="metric-note">{overdue.length ? "Past the disable deadline" : "All within deadline"}</div>
          </div>
          <div className="metric">
            <div className="metric-value">{accessOpen.length + accessApproved.length}</div>
            <div className="metric-label">Open access requests</div>
            <div className="metric-note">{accessApproved.length} ready to grant</div>
          </div>
          {can(s, "docsView") && (
            <div className="metric">
              <div className="metric-value">{docCount}</div>
              <div className="metric-label">Vault documents</div>
              <div className="metric-note">Encrypted at rest</div>
            </div>
          )}
        </div>

        <div className="grid-32">
          <Panel title="Account lifecycle" sub="Every request, by where it is now">
            <Pipeline
              stages={[
                { key: "pending", label: "Awaiting approval", value: pending.length, hint: "With a manager" },
                { key: "active", label: "Active", value: active.length, hint: "Account in use" },
                { key: "sched", label: "Offboarding", value: scheduled.length, hint: "Deadline set" },
                { key: "disabled", label: "Disabled", value: disabled.length, hint: "Access removed" },
                { key: "problem", label: "Rejected or failed", value: problem.length, hint: "Needs follow-up" },
              ]}
            />
          </Panel>
          <Panel title="Waiting on you" sub={attn.length ? `${attn.length} item${attn.length === 1 ? "" : "s"} for your role` : undefined} flush>
            {attn.length === 0 ? (
              <Empty icon="check" title="You're all caught up" small>Nothing needs your action right now.</Empty>
            ) : (
              attn.slice(0, 6).map((a) => (
                <Link key={a.href + a.title} href={a.href} className="attn">
                  <span className={`attn-icon tone-${a.tone}`}><Icon name={a.icon} size={17} /></span>
                  <span style={{ minWidth: 0 }}>
                    <div className="attn-title">{a.title}</div>
                    <div className="attn-sub">{a.sub}</div>
                  </span>
                  <span className={`badge tone-${a.tone}`}><i className="dot" aria-hidden="true" />{a.tag}</span>
                </Link>
              ))
            )}
          </Panel>
        </div>

        <div className="grid-2">
          <Panel title="New hire requests" sub="Created per week, last 8 weeks">
            <ColumnChart data={weeks.map((w) => ({ label: w.label, value: w.value }))} noun="requests" valueLabel="Requests" />
          </Panel>
          <Panel title="Offboarding deadlines" sub="Accounts disabled on time vs late">
            <SplitMeter onTime={onTime} late={late} />
          </Panel>
        </div>

        <div className="grid-2">
          <Panel title="Requests by department" sub="Top departments">
            <HBars data={depts} empty="No requests yet" />
          </Panel>
          {can(s, "viewAudit") ? (
            <Panel title="Recent activity" sub="Latest entries in the audit log" actions={<Link href="/audit" className="btn sm">View all</Link>}>
              {events.length === 0 ? (
                <Empty small title="No activity yet" />
              ) : (
                <ol className="timeline">
                  {events.map((e) => (
                    <li className="tl-item" key={e.id}>
                      <span className={`tl-dot ${actionTone(e.action)}`} />
                      <div className="tl-main">
                        <div className="tl-title">{label(e.action)}</div>
                        <div className="tl-sub">{e.actor}{e.detail ? ` · ${e.detail}` : ""}</div>
                      </div>
                      <time className="tl-time">{relTime(e.createdAt)}</time>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          ) : (
            <Panel title="Latest requests" sub="Most recent onboarding activity" actions={<Link href="/requests" className="btn sm">View all</Link>} flush>
              {requests.length === 0 ? (
                <Empty small title="No requests yet" />
              ) : (
                requests.slice(0, 5).map((r) => (
                  <Link key={r.id} href={`/requests/${r.id}`} className="attn" style={{ gridTemplateColumns: "34px minmax(0,1fr) auto" }}>
                    <Avatar name={`${r.firstName} ${r.lastName}`} />
                    <span style={{ minWidth: 0 }}>
                      <div className="attn-title">{r.firstName} {r.lastName}</div>
                      <div className="attn-sub">{r.roleTemplate.name} · {relTime(r.createdAt)}</div>
                    </span>
                    <StatusBadge status={r.status} />
                  </Link>
                ))
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
