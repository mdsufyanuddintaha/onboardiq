import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { createAccessRequestAction } from "../../access-actions";
import { PageHeader, Panel, Alert } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

export const metadata: Metadata = { title: "New access request" };

export default async function NewAccess({ searchParams }: { searchParams: { error?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!can(s, "createAccess")) redirect("/access");

  // Suggest groups already used by role templates
  const templates = await db.roleTemplate.findMany({ select: { adGroups: true } });
  const groups = Array.from(new Set(templates.flatMap((t) => t.adGroups))).sort();

  return (
    <>
      <PageHeader title="New access request" sub="Explain what access is needed and why. A different manager reviews it." back={{ href: "/access", label: "Access requests" }} />
      <div style={{ maxWidth: 760 }}>
        {searchParams.error && <Alert tone="bad">{searchParams.error}</Alert>}
        <Panel>
          <form action={createAccessRequestAction} className="form-grid">
            <div className="field span-2">
              <label className="label" htmlFor="title">Title</label>
              <input id="title" name="title" className="input" placeholder="Repository access for the payments service" maxLength={120} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="employee">Employee username</label>
              <input id="employee" name="employee" className="input" placeholder="jdoe" autoCapitalize="none" spellCheck={false} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="groupName">AD group</label>
              <input id="groupName" name="groupName" className="input" list="known-groups" placeholder="SG-Git-Access" required />
              <datalist id="known-groups">
                {groups.map((g) => <option key={g} value={g} />)}
              </datalist>
              <span className="hint">Pick a known group or type the exact AD group name.</span>
            </div>
            <div className="field">
              <label className="label" htmlFor="priority">Priority</label>
              <select id="priority" name="priority" className="select" defaultValue="MEDIUM">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div className="field span-2">
              <label className="label" htmlFor="description">Why is this access needed?</label>
              <textarea id="description" name="description" className="textarea" minLength={10} maxLength={1000} required placeholder="Describe the task or project that requires this access." />
            </div>
            <div className="span-2 form-actions">
              <SubmitButton pendingText="Submitting…">Submit request</SubmitButton>
              <Link href="/access" className="btn ghost">Cancel</Link>
            </div>
          </form>
        </Panel>
      </div>
    </>
  );
}
