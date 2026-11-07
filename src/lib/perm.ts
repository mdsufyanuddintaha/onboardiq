import type { Role, Session } from "./session";

// Single source of truth for who may do what. Used by pages (to show/hide UI)
// and by server actions / route handlers (to enforce it).
const MAP = {
  createRequest: ["HR"],
  decideRequest: ["MANAGER"],
  scheduleOffboard: ["HR"],
  disableAccount: ["IT"],
  viewAudit: ["IT", "AUDITOR"],
  exportData: ["IT", "AUDITOR"],
  docsView: ["HR", "MANAGER", "AUDITOR"],
  docsDownload: ["HR", "MANAGER"],
  docsUpload: ["HR"],
  docsManage: ["HR"],
  createAccess: ["HR", "MANAGER"],
  decideAccess: ["MANAGER"],
  fulfillAccess: ["IT"],
  manageTemplates: ["IT"],
} as const;

export type Perm = keyof typeof MAP;

export function rolesFor(p: Perm): Role[] {
  return [...MAP[p]] as Role[];
}

export function can(s: Session | null, p: Perm): boolean {
  if (!s) return false;
  const allowed = MAP[p] as readonly Role[];
  return s.roles.some((r) => allowed.includes(r));
}

export const ROLE_LABEL: Record<string, string> = {
  HR: "HR",
  MANAGER: "Manager",
  IT: "IT",
  AUDITOR: "Auditor",
};
