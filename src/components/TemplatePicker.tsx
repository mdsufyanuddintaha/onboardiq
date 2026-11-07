"use client";

import { useState } from "react";

type T = { id: string; name: string; department: string; adGroups: string[] };

// Role template select with a live preview of the AD groups the new hire will receive.
export default function TemplatePicker({ templates }: { templates: T[] }) {
  const [id, setId] = useState("");
  const chosen = templates.find((t) => t.id === id);
  return (
    <div className="field span-2">
      <label className="label" htmlFor="roleTemplateId">Role template</label>
      <select id="roleTemplateId" name="roleTemplateId" className="select" required value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">Choose a role…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name} ({t.department})</option>
        ))}
      </select>
      {chosen ? (
        <div className="share-pop" aria-live="polite">
          <div className="hint" style={{ marginBottom: 8 }}>On approval, the account joins these AD groups:</div>
          <div className="chips">
            {chosen.adGroups.map((g) => (
              <span className="chip" key={g}>{g}</span>
            ))}
          </div>
        </div>
      ) : (
        <span className="hint">The role decides which AD security groups the account gets.</span>
      )}
    </div>
  );
}
