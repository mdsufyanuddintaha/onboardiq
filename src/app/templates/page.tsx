import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/perm";
import { createTemplateAction, deleteTemplateAction } from "../template-actions";
import { PageHeader, Panel, Empty, Alert, Chips } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import Icon from "@/components/Icon";

export const metadata: Metadata = { title: "Role templates" };

export default async function Templates({ searchParams }: { searchParams: { error?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login?next=/templates");
  const manage = can(s, "manageTemplates");

  const templates = await db.roleTemplate.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { requests: true } } } });

  return (
    <>
      <PageHeader title="Role templates" sub="Each job role maps to the Active Directory groups a new hire receives. This keeps access consistent and limited to what the role needs." />

      <div className="stack">
        {searchParams.error && <Alert tone="bad">{searchParams.error}</Alert>}

        <Panel flush>
          {templates.length === 0 ? (
            <Empty icon="layers" title="No role templates yet">
              {manage ? "Add the first one below. HR can't submit new hire requests until a role exists." : "An IT admin needs to add a role before HR can submit requests."}
            </Empty>
          ) : (
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr><th>Role</th><th>Department</th><th>AD groups</th><th>In use</th>{manage && <th><span className="sr-only">Actions</span></th>}</tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td><div className="name">{t.name}</div></td>
                      <td className="muted">{t.department}</td>
                      <td><Chips items={t.adGroups} /></td>
                      <td className="muted nowrap">{t._count.requests === 0 ? "Not used" : `${t._count.requests} request${t._count.requests === 1 ? "" : "s"}`}</td>
                      {manage && (
                        <td className="right">
                          {t._count.requests === 0 && (
                            <form action={deleteTemplateAction} className="inline-form">
                              <input type="hidden" name="id" value={t.id} />
                              <SubmitButton variant="ghost" size="sm" confirm={`Delete the ${t.name} role?`}>
                                <Icon name="trash" size={15} />
                                <span className="sr-only">Delete {t.name}</span>
                              </SubmitButton>
                            </form>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {manage ? (
          <Panel title="Add a role" sub="Groups must already exist in Active Directory. Privileged groups such as Domain Admins are blocked.">
            <form action={createTemplateAction} className="form-grid">
              <div className="field">
                <label className="label" htmlFor="name">Role name</label>
                <input id="name" name="name" className="input" placeholder="Support Engineer" autoComplete="off" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="department">Department</label>
                <input id="department" name="department" className="input" placeholder="Customer Success" autoComplete="off" required />
              </div>
              <div className="field span-2">
                <label className="label" htmlFor="groups">AD groups</label>
                <textarea id="groups" name="groups" className="textarea" rows={3} placeholder={"SG-Support\nSG-Helpdesk-Agents"} required />
                <span className="hint">One per line, or separated by commas.</span>
              </div>
              <div className="span-2 form-actions">
                <SubmitButton pendingText="Adding…">Add role</SubmitButton>
              </div>
            </form>
          </Panel>
        ) : (
          <Alert tone="info" title="Managed by IT">Only IT admins can add or remove roles.</Alert>
        )}
      </div>
    </>
  );
}
