import { db } from "./db";
import type { Session } from "./session";

export async function audit(
  actor: Session | { username: string; roles: string[] },
  action: string,
  requestId?: string | null,
  detail?: string | null,
  accessRequestId?: string | null
) {
  await db.auditEvent.create({
    data: {
      actor: actor.username,
      actorRole: actor.roles.join(","),
      action,
      requestId: requestId ?? null,
      accessRequestId: accessRequestId ?? null,
      detail: detail ?? null,
    },
  });
}

// For events with no signed-in user (e.g. failed logins)
export async function auditAnon(username: string, action: string, detail?: string) {
  await db.auditEvent.create({ data: { actor: username || "unknown", actorRole: "NONE", action, detail: detail ?? null } });
}
