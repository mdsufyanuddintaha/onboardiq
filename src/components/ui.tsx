import Link from "next/link";
import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import { initials, label, qs } from "@/lib/format";

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

export function PageHeader({ title, sub, back, children }: { title: string; sub?: string; back?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <>
      {back && (
        <Link href={back.href} className="back">
          <Icon name="back" size={16} />
          {back.label}
        </Link>
      )}
      <header className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
        {children && <div className="page-actions">{children}</div>}
      </header>
    </>
  );
}

export function Panel({ title, sub, actions, flush, children, id }: { title?: string; sub?: string; actions?: ReactNode; flush?: boolean; children: ReactNode; id?: string }) {
  return (
    <section className={"panel" + (flush ? " flush" : "")} id={id}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {sub && <p className="panel-sub">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  return <span className={"avatar" + (large ? " lg" : "")} aria-hidden="true">{initials(name)}</span>;
}

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`badge tone-${tone}`}>
      <i className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: "Awaiting approval", tone: "warn" },
  REJECTED: { label: "Rejected", tone: "bad" },
  PROVISIONED: { label: "Active", tone: "good" },
  PROVISION_FAILED: { label: "Provisioning failed", tone: "bad" },
  OFFBOARD_SCHEDULED: { label: "Offboarding scheduled", tone: "info" },
  DISABLED: { label: "Disabled", tone: "neutral" },
};
export const REQUEST_STATUS_OPTIONS = Object.entries(REQUEST_STATUS).map(([value, v]) => ({ value, label: v.label }));

export function StatusBadge({ status }: { status: string }) {
  const s = REQUEST_STATUS[status] ?? { label: label(status), tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const ACCESS_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Awaiting approval", tone: "warn" },
  APPROVED: { label: "Approved, ready to grant", tone: "info" },
  DENIED: { label: "Denied", tone: "bad" },
  FULFILLED: { label: "Granted", tone: "good" },
};
export const ACCESS_STATUS_OPTIONS = Object.entries(ACCESS_STATUS).map(([value, v]) => ({ value, label: v.label }));

export function AccessBadge({ status }: { status: string }) {
  const s = ACCESS_STATUS[status] ?? { label: label(status), tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone: Tone = priority === "HIGH" ? "bad" : priority === "MEDIUM" ? "info" : "neutral";
  return <Badge tone={tone}>{label(priority)}</Badge>;
}

export function actionTone(a: string): Tone {
  if (/FAILED|DENIED|REJECTED|LATE|ERROR/.test(a)) return "bad";
  if (/ON_TIME|CREATED|APPROVED|GRANTED|UPLOADED|SUCCESS/.test(a)) return "good";
  if (/DISABLED|SCHEDULED|SHARE|EXPORT|DOWNLOAD|DELETED|REVOKED|REQUESTED/.test(a)) return "info";
  return "neutral";
}

export function ActionBadge({ action }: { action: string }) {
  return <Badge tone={actionTone(action)}>{label(action)}</Badge>;
}

export function Alert({ tone = "bad", icon, title, children }: { tone?: Tone; icon?: IconName; title?: string; children?: ReactNode }) {
  const ic: IconName = icon ?? (tone === "good" ? "check" : tone === "info" ? "info" : "alert");
  return (
    <div className={`alert tone-${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon name={ic} />
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon = "inbox", title, children, small }: { icon?: IconName; title: string; children?: ReactNode; small?: boolean }) {
  return (
    <div className={"empty" + (small ? " small" : "")}>
      <Icon name={icon} size={small ? 20 : 26} />
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Chips({ items }: { items: string[] }) {
  return (
    <div className="chips">
      {items.map((g) => (
        <span className="chip" key={g}>{g}</span>
      ))}
    </div>
  );
}

export function Pager({ page, pages, total, noun, base, params }: { page: number; pages: number; total: number; noun: string; base: string; params: Record<string, string | undefined> }) {
  return (
    <div className="pager">
      <span>
        {total} {noun}
        {pages > 1 ? ` · page ${page} of ${pages}` : ""}
      </span>
      {pages > 1 && (
        <div className="btn-row">
          {page > 1 ? (
            <Link className="btn sm" href={qs(base, { ...params, page: String(page - 1) })}>Previous</Link>
          ) : (
            <span className="btn sm" aria-disabled="true" style={{ opacity: 0.45, pointerEvents: "none" }}>Previous</span>
          )}
          {page < pages ? (
            <Link className="btn sm" href={qs(base, { ...params, page: String(page + 1) })}>Next</Link>
          ) : (
            <span className="btn sm" aria-disabled="true" style={{ opacity: 0.45, pointerEvents: "none" }}>Next</span>
          )}
        </div>
      )}
    </div>
  );
}

export function parsePage(v: string | undefined): number {
  const n = parseInt(v ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}
