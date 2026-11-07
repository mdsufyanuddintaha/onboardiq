import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { createRequestAction } from "../../actions";
import { PageHeader, Panel, Alert } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import TemplatePicker from "@/components/TemplatePicker";
import Link from "next/link";

export const metadata: Metadata = { title: "New hire" };

export default async function NewRequest({ searchParams }: { searchParams: { error?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!can(s, "createRequest")) redirect("/requests");
  const templates = await db.roleTemplate.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader title="New hire" sub="A manager approves the request, then the Active Directory account is created automatically." back={{ href: "/requests", label: "Onboarding" }} />
      <div style={{ maxWidth: 760 }}>
        {searchParams.error && <Alert tone="bad">{searchParams.error}</Alert>}
        {templates.length === 0 ? (
          <Alert tone="warn" title="No role templates yet">
            An IT admin needs to <Link href="/templates" className="link">create a role template</Link> before you can submit a request.
          </Alert>
        ) : (
          <Panel>
            <form action={createRequestAction} className="form-grid">
              <div className="field">
                <label className="label" htmlFor="firstName">First name</label>
                <input id="firstName" name="firstName" className="input" autoComplete="off" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="lastName">Last name</label>
                <input id="lastName" name="lastName" className="input" autoComplete="off" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="username">Username</label>
                <input id="username" name="username" className="input" placeholder="jdoe" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
                <span className="hint">Becomes the AD sign-in name. 3–20 characters: lowercase letters, digits and dots.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="email">Work email</label>
                <input id="email" name="email" type="email" className="input" autoComplete="off" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="jobTitle">Job title</label>
                <input id="jobTitle" name="jobTitle" className="input" autoComplete="off" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="startDate">Start date</label>
                <input id="startDate" name="startDate" type="date" className="input" required />
              </div>
              <TemplatePicker templates={templates.map((t) => ({ id: t.id, name: t.name, department: t.department, adGroups: t.adGroups }))} />
              <div className="span-2 form-actions">
                <SubmitButton pendingText="Creating…">Create request</SubmitButton>
                <Link href="/requests" className="btn ghost">Cancel</Link>
              </div>
            </form>
          </Panel>
        )}
      </div>
    </>
  );
}
