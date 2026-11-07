import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { getSession, hasRole } from "@/lib/session";
import { can } from "@/lib/perm";
import { fmtBytes, fmtDateTime, fmtDay, label, relTime } from "@/lib/format";
import { CATEGORIES } from "@/lib/vault";
import { approveRequestAction, rejectRequestAction, scheduleOffboardAction, disableAccountAction } from "../../actions";
import { uploadDocumentAction, createShareLinkAction, deleteDocumentAction } from "../../doc-actions";
import { PageHeader, Panel, Alert, Avatar, StatusBadge, Chips, Empty, actionTone } from "@/components/ui";
import Stepper, { type Step } from "@/components/Stepper";
import SubmitButton from "@/components/SubmitButton";
import CopyButton from "@/components/CopyButton";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Request" };

export default async function RequestPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const r = await db.request.findUnique({
    where: { id: params.id },
    include: {
      roleTemplate: true,
      events: { orderBy: { createdAt: "desc" } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!r) notFound();

  const jar = cookies();
  const secret = hasRole(s, "MANAGER", "HR") ? jar.get("oiq_flash")?.value : undefined;
  const sharePath = can(s, "docsManage") ? jar.get("oiq_share")?.value : undefined;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const shareUrl = sharePath ? (host ? `${proto}://${host}${sharePath}` : sharePath) : undefined;

  const name = `${r.firstName} ${r.lastName}`;
  const st = r.status;
  const rejected = st === "REJECTED";
  const failed = st === "PROVISION_FAILED";
  const pending = st === "PENDING_APPROVAL";

  const steps: Step[] = [
    { label: "Requested", detail: `${fmtDateTime(r.createdAt)} · ${r.requestedBy}`, state: "done" },
    rejected
      ? { label: "Rejected", detail: `By ${r.approvedBy ?? "a manager"}`, state: "failed" }
      : pending
      ? { label: "Manager approval", detail: "Waiting for a manager", state: "current" }
      : { label: "Approved", detail: `By ${r.approvedBy ?? "a manager"}`, state: "done" },
    rejected || pending
      ? { label: "Account created", detail: "After approval", state: "todo" }
      : failed
      ? { label: "Account failed", detail: "Provisioning error, retry below", state: "failed" }
      : { label: "Account created", detail: fmtDateTime(r.provisionedAt), state: "done" },
    st === "OFFBOARD_SCHEDULED"
      ? { label: "Offboarding", detail: `Disable by ${fmtDateTime(r.dueDisableAt)}`, state: "current" }
      : st === "DISABLED"
      ? { label: "Offboarding", detail: `Deadline ${fmtDateTime(r.dueDisableAt)}`, state: "done" }
      : { label: "Offboarding", detail: "Not scheduled", state: "todo" },
    st === "DISABLED"
      ? { label: "Access removed", detail: fmtDateTime(r.disabledAt), state: "done" }
      : { label: "Access removed", detail: "After offboarding", state: "todo" },
  ];

  const canDecide = can(s, "decideRequest") && (pending || failed);
  const ownRequest = r.requestedBy === s.username;
  const canSchedule = can(s, "scheduleOffboard") && st === "PROVISIONED";
  const canDisable = can(s, "disableAccount") && st === "OFFBOARD_SCHEDULED";
  const canSeeDocs = can(s, "docsView");
  const late = !!r.disabledAt && !!r.dueDisableAt && r.disabledAt > r.dueDisableAt;

  return (
    <>
      <PageHeader title={name} sub={`${r.jobTitle} · ${r.department}`} back={{ href: "/requests", label: "Onboarding" }}>
        <StatusBadge status={st} />
      </PageHeader>

      {searchParams.error && <Alert tone="bad">{searchParams.error}</Alert>}
      {secret && (
        <Alert tone="good" title="Account created">
          <div>Share this temporary password with the new hire securely. It is shown once, never stored, and must be changed at first sign-in.</div>
          <div className="secret">
            <code>{secret.split(": ").slice(1).join(": ")}</code>
            <CopyButton text={secret.split(": ").slice(1).join(": ")} label="Copy password" />
          </div>
        </Alert>
      )}
      {r.failureNote && failed && (
        <Alert tone="bad" title="Provisioning failed">
          {r.failureNote}
        </Alert>
      )}
      {late && <Alert tone="warn" title="Disabled after the deadline">This account was disabled {relTime(r.disabledAt!)}, after its deadline of {fmtDateTime(r.dueDisableAt)}.</Alert>}

      <div className="stack">
        <Panel title="Lifecycle" sub="Where this request is, and what comes next">
          <Stepper steps={steps} />
          {(canDecide || canSchedule || canDisable || (can(s, "decideRequest") && pending && ownRequest)) && (
            <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
              {canDecide && ownRequest && pending && (
                <div className="note-quiet"><Icon name="info" size={16} />You submitted this request, so another manager has to decide it.</div>
              )}
              {canDecide && !(ownRequest && pending) && (
                <div className="btn-row">
                  <form action={approveRequestAction} className="inline-form">
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton pendingText="Creating account…">{failed ? "Retry provisioning" : "Approve and create account"}</SubmitButton>
                  </form>
                  {pending && (
                    <form action={rejectRequestAction} className="inline-form">
                      <input type="hidden" name="id" value={r.id} />
                      <input className="input" name="note" placeholder="Reason (optional)" aria-label="Reason for rejecting" style={{ width: 240 }} maxLength={300} />
                      <SubmitButton variant="danger" confirm="Reject this request?">Reject</SubmitButton>
                    </form>
                  )}
                </div>
              )}
              {canSchedule && (
                <form action={scheduleOffboardAction} className="inline-form" style={{ alignItems: "flex-end" }}>
                  <input type="hidden" name="id" value={r.id} />
                  <div className="field">
                    <label className="label" htmlFor="due">Disable the account by</label>
                    <input id="due" className="input" type="datetime-local" name="dueDisableAt" required />
                  </div>
                  <SubmitButton variant="default">Schedule offboarding</SubmitButton>
                </form>
              )}
              {canDisable && (
                <form action={disableAccountAction} className="btn-row">
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton variant="solid-danger" confirm={`Disable ${r.username} and remove their group access?`} pendingText="Disabling…">Disable account and remove access</SubmitButton>
                  {r.dueDisableAt && <span className="muted">Deadline {relTime(r.dueDisableAt)}</span>}
                </form>
              )}
            </div>
          )}
        </Panel>

        <div className="grid-23">
          <Panel title="Details">
            <dl className="dl">
              <dt>Employee</dt>
              <dd>
                <span className="cell-person">
                  <Avatar name={name} />
                  <span><div className="name">{name}</div><div className="sub">{r.email}</div></span>
                </span>
              </dd>
              <dt>Username</dt><dd className="mono">{r.username}</dd>
              <dt>Role template</dt><dd>{r.roleTemplate.name}</dd>
              <dt>Start date</dt><dd>{fmtDay(r.startDate)}</dd>
              <dt>Requested by</dt><dd>{r.requestedBy}</dd>
              {r.approvedBy && (<><dt>{rejected ? "Rejected by" : "Approved by"}</dt><dd>{r.approvedBy}</dd></>)}
              {r.rejectionNote && (<><dt>Reason</dt><dd>{r.rejectionNote}</dd></>)}
              <dt>AD groups</dt><dd><Chips items={r.roleTemplate.adGroups} /></dd>
            </dl>
          </Panel>

          {canSeeDocs ? (
            <Panel title="HR documents" sub="Encrypted at rest. Every download is logged." flush>
              {r.documents.length === 0 ? (
                <Empty icon="file" title="No documents yet" small>
                  {can(s, "docsUpload") ? "Upload the signed offer letter, ID or tax forms below." : "HR uploads paperwork here."}
                </Empty>
              ) : (
                r.documents.map((d) => (
                  <div className="doc-row" key={d.id}>
                    <span className="doc-icon"><Icon name="file" /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="doc-name">{d.originalName}</div>
                      <div className="doc-meta">{d.category} · {fmtBytes(d.size)} · {d.uploadedBy}, {relTime(d.createdAt)}</div>
                    </div>
                    <div className="doc-actions">
                      {can(s, "docsDownload") && (
                        <a className="btn sm" href={`/api/documents/${d.id}`}>
                          <Icon name="download" size={15} />
                          Download
                        </a>
                      )}
                      {can(s, "docsManage") && (
                        <>
                          <details className="share">
                            <summary className="btn sm"><Icon name="link" size={15} />Share</summary>
                            <form action={createShareLinkAction} className="share-pop stack" style={{ gap: 10 }}>
                              <input type="hidden" name="documentId" value={d.id} />
                              <input type="hidden" name="returnTo" value={`/requests/${r.id}`} />
                              <div className="field">
                                <label className="label" htmlFor={`h-${d.id}`}>Expires after</label>
                                <select id={`h-${d.id}`} className="select" name="hours" defaultValue="24">
                                  <option value="1">1 hour</option>
                                  <option value="24">24 hours</option>
                                  <option value="168">7 days</option>
                                </select>
                              </div>
                              <div className="field">
                                <label className="label" htmlFor={`m-${d.id}`}>Download limit</label>
                                <select id={`m-${d.id}`} className="select" name="maxDownloads" defaultValue="3">
                                  <option value="1">1 download</option>
                                  <option value="3">3 downloads</option>
                                  <option value="10">10 downloads</option>
                                </select>
                              </div>
                              <SubmitButton size="sm" pendingText="Creating…">Create link</SubmitButton>
                            </form>
                          </details>
                          <form action={deleteDocumentAction} className="inline-form">
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="returnTo" value={`/requests/${r.id}`} />
                            <SubmitButton variant="ghost" size="sm" confirm={`Delete ${d.originalName}? This removes the encrypted file.`}>
                              <Icon name="trash" size={15} />
                              <span className="sr-only">Delete {d.originalName}</span>
                            </SubmitButton>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
              {shareUrl && (
                <div style={{ padding: "0 22px 16px" }}>
                  <Alert tone="info" icon="link" title="Share link created">
                    Expiring link. Recipients must sign in as HR or a manager. It is shown once.
                    <div className="secret"><code>{shareUrl}</code><CopyButton text={shareUrl} label="Copy link" /></div>
                  </Alert>
                </div>
              )}
              {can(s, "docsUpload") && (
                <form action={uploadDocumentAction} className="stack" style={{ gap: 14, padding: "18px 22px 22px", borderTop: "1px solid var(--line)" }}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <div className="form-grid">
                    <div className="field">
                      <label className="label" htmlFor="category">Category</label>
                      <select id="category" name="category" className="select" required defaultValue="">
                        <option value="" disabled>Choose…</option>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="file">File</label>
                      <input id="file" name="file" type="file" className="input" required accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt" />
                    </div>
                  </div>
                  <div className="btn-row">
                    <SubmitButton pendingText="Encrypting and saving…"><Icon name="upload" size={16} />Upload</SubmitButton>
                    <span className="hint">PDF, PNG, JPG, DOCX, XLSX or TXT, up to 10 MB.</span>
                  </div>
                </form>
              )}
            </Panel>
          ) : (
            <Panel title="History" sub="Every action on this request">
              <History events={r.events} />
            </Panel>
          )}
        </div>

        {canSeeDocs && (
          <Panel title="History" sub="Every action on this request">
            <History events={r.events} />
          </Panel>
        )}
      </div>
    </>
  );
}

function History({ events }: { events: { id: string; action: string; actor: string; detail: string | null; createdAt: Date }[] }) {
  if (events.length === 0) return <Empty small title="No history yet" />;
  return (
    <ol className="timeline">
      {events.map((e) => (
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
  );
}
