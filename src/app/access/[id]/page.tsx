import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can, ROLE_LABEL } from "@/lib/perm";
import { fmtDateTime, label, relTime } from "@/lib/format";
import { decideAccessAction, fulfillAccessAction, commentAccessAction } from "../../access-actions";
import { PageHeader, Panel, Alert, Avatar, AccessBadge, PriorityBadge, Empty, actionTone } from "@/components/ui";
import Stepper, { type Step } from "@/components/Stepper";
import SubmitButton from "@/components/SubmitButton";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Access request" };

export default async function AccessDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const a = await db.accessRequest.findUnique({
    where: { id: params.id },
    include: { comments: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "desc" } } },
  });
  if (!a) notFound();

  const denied = a.status === "DENIED";
  const open = a.status === "OPEN";
  const steps: Step[] = [
    { label: "Requested", detail: `${fmtDateTime(a.createdAt)} · ${a.requestedBy}`, state: "done" },
    denied
      ? { label: "Denied", detail: `By ${a.decidedBy}`, state: "failed" }
      : open
      ? { label: "Manager approval", detail: "Waiting for a manager", state: "current" }
      : { label: "Approved", detail: `By ${a.decidedBy}`, state: "done" },
    a.status === "FULFILLED"
      ? { label: "Access granted", detail: `${fmtDateTime(a.fulfilledAt)} · ${a.fulfilledBy}`, state: "done" }
      : a.status === "APPROVED"
      ? { label: "Access granted", detail: a.failureNote ? "Last attempt failed" : "IT adds the AD group", state: a.failureNote ? "failed" : "current" }
      : { label: "Access granted", detail: "After approval", state: "todo" },
  ];

  const ownRequest = a.requestedBy === s.username;
  const canDecide = can(s, "decideAccess") && open;
  const canFulfill = can(s, "fulfillAccess") && a.status === "APPROVED";

  return (
    <>
      <PageHeader title={a.title} sub={`Request #${a.number} · ${a.groupName} for ${a.employee}`} back={{ href: "/access", label: "Access requests" }}>
        <PriorityBadge priority={a.priority} />
        <AccessBadge status={a.status} />
      </PageHeader>

      {searchParams.error && <Alert tone="bad">{searchParams.error}</Alert>}
      {a.failureNote && a.status === "APPROVED" && <Alert tone="bad" title="Couldn't grant access">{a.failureNote}</Alert>}

      <div className="stack">
        <Panel title="Progress">
          <Stepper steps={steps} />
          {(canDecide || canFulfill) && (
            <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
              {canDecide && ownRequest && <div className="note-quiet"><Icon name="info" size={16} />You submitted this request, so another manager has to decide it.</div>}
              {canDecide && !ownRequest && (
                <form action={decideAccessAction} className="inline-form" style={{ alignItems: "flex-end" }}>
                  <input type="hidden" name="id" value={a.id} />
                  <div className="field" style={{ minWidth: 260 }}>
                    <label className="label" htmlFor="note">Note (optional)</label>
                    <input id="note" name="note" className="input" maxLength={300} placeholder="Reason for your decision" />
                  </div>
                  <button className="btn primary" type="submit" name="decision" value="approve">Approve</button>
                  <button className="btn danger" type="submit" name="decision" value="deny">Deny</button>
                </form>
              )}
              {canFulfill && (
                <form action={fulfillAccessAction} className="btn-row">
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton pendingText="Adding to group…" confirm={`Add ${a.employee} to ${a.groupName}?`}>Grant access in Active Directory</SubmitButton>
                  <span className="muted">Adds {a.employee} to {a.groupName}</span>
                </form>
              )}
            </div>
          )}
        </Panel>

        <div className="grid-23">
          <Panel title="Details">
            <dl className="dl">
              <dt>Employee</dt><dd className="mono">{a.employee}</dd>
              <dt>AD group</dt><dd><span className="chip">{a.groupName}</span></dd>
              <dt>Requested by</dt><dd>{a.requestedBy}</dd>
              <dt>Created</dt><dd>{fmtDateTime(a.createdAt)}</dd>
              {a.decidedBy && (<><dt>{denied ? "Denied by" : "Approved by"}</dt><dd>{a.decidedBy}, {relTime(a.decidedAt!)}</dd></>)}
              {a.decisionNote && (<><dt>Decision note</dt><dd>{a.decisionNote}</dd></>)}
              <dt>Justification</dt><dd style={{ whiteSpace: "pre-wrap" }}>{a.description}</dd>
            </dl>
          </Panel>

          <Panel title="Discussion" sub={a.comments.length ? `${a.comments.length} comment${a.comments.length === 1 ? "" : "s"}` : undefined}>
            {a.comments.length === 0 ? (
              <Empty small title="No comments yet">Ask a question or add context for the reviewer.</Empty>
            ) : (
              <div>
                {a.comments.map((c) => (
                  <div className="comment" key={c.id}>
                    <Avatar name={c.author} />
                    <div>
                      <div className="comment-head">
                        <strong>{c.author}</strong>
                        <span className="muted">{c.authorRole.split(",").map((r) => ROLE_LABEL[r] ?? r).join(", ")} · {relTime(c.createdAt)}</span>
                      </div>
                      <div className="comment-body">{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form action={commentAccessAction} className="stack" style={{ gap: 10, marginTop: 18 }}>
              <input type="hidden" name="id" value={a.id} />
              <label className="sr-only" htmlFor="body">Add a comment</label>
              <textarea id="body" name="body" className="textarea" style={{ minHeight: 84 }} maxLength={1000} required placeholder="Add a comment" />
              <div><SubmitButton variant="default" size="sm" pendingText="Posting…">Post comment</SubmitButton></div>
            </form>
          </Panel>
        </div>

        <Panel title="History" sub="Every action on this request">
          {a.events.length === 0 ? (
            <Empty small title="No history yet" />
          ) : (
            <ol className="timeline">
              {a.events.map((e) => (
                <li className="tl-item" key={e.id}>
                  <span className={`tl-dot ${actionTone(e.action)}`} />
                  <div className="tl-main">
                    <div className="tl-title">{label(e.action)}</div>
                    <div className="tl-sub">{e.actor}{e.detail ? ` · ${e.detail}` : ""}</div>
                  </div>
                  <time className="tl-time">{fmtDateTime(e.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
