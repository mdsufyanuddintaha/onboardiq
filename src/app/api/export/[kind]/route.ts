import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { audit } from "@/lib/audit";
import { csvResponse, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 50_000;
const KINDS = ["audit", "requests", "access"];

// CSV feeds for the data warehouse / Power BI load. IT and Auditors only, and every export is logged.
export async function GET(_req: Request, { params }: { params: { kind: string } }) {
  const s = await getSession();
  if (!s) return new Response("Sign in to export data.", { status: 401 });
  if (!can(s, "exportData")) return new Response("Your role can't export data.", { status: 403 });
  const kind = params.kind.replace(/\.csv$/, "");
  if (!KINDS.includes(kind)) return new Response("Unknown export.", { status: 404 });

  let rows: (string | number | boolean | Date | null)[][] = [];

  if (kind === "audit") {
    const events = await db.auditEvent.findMany({ orderBy: { createdAt: "asc" }, take: LIMIT });
    rows = [
      ["id", "created_at", "actor", "actor_role", "action", "request_id", "access_request_id", "detail"],
      ...events.map((e) => [e.id, e.createdAt, e.actor, e.actorRole, e.action, e.requestId, e.accessRequestId, e.detail]),
    ];
  } else if (kind === "requests") {
    const reqs = await db.request.findMany({ orderBy: { createdAt: "asc" }, take: LIMIT, include: { roleTemplate: { select: { name: true, adGroups: true } } } });
    rows = [
      ["id", "status", "username", "department", "job_title", "role_template", "ad_groups", "start_date", "requested_by", "approved_by", "created_at", "approved_at", "provisioned_at", "hours_to_provision", "disable_deadline", "disabled_at", "disabled_on_time"],
      ...reqs.map((r) => [
        r.id,
        r.status,
        r.username,
        r.department,
        r.jobTitle,
        r.roleTemplate.name,
        r.roleTemplate.adGroups.join(";"),
        r.startDate,
        r.requestedBy,
        r.approvedBy,
        r.createdAt,
        r.approvedAt,
        r.provisionedAt,
        r.provisionedAt ? Math.round(((r.provisionedAt.getTime() - r.createdAt.getTime()) / 3_600_000) * 100) / 100 : null,
        r.dueDisableAt,
        r.disabledAt,
        r.disabledAt && r.dueDisableAt ? r.disabledAt <= r.dueDisableAt : null,
      ]),
    ];
  } else {
    const acc = await db.accessRequest.findMany({ orderBy: { createdAt: "asc" }, take: LIMIT });
    rows = [
      ["id", "number", "employee", "ad_group", "priority", "status", "requested_by", "decided_by", "created_at", "decided_at", "fulfilled_by", "fulfilled_at"],
      ...acc.map((a) => [a.id, a.number, a.employee, a.groupName, a.priority, a.status, a.requestedBy, a.decidedBy, a.createdAt, a.decidedAt, a.fulfilledBy, a.fulfilledAt]),
    ];
  }

  await audit(s, "EXPORT_DOWNLOADED", null, `${kind}: ${rows.length - 1} rows`);
  const day = new Date().toISOString().slice(0, 10);
  return csvResponse(`onboardiq-${kind}-${day}.csv`, toCsv(rows));
}
