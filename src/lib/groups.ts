import { db } from "./db";

// Groups that must never be handed out through this app, even if someone types them in.
const PRIVILEGED = [
  "domain admins",
  "enterprise admins",
  "schema admins",
  "administrators",
  "account operators",
  "backup operators",
  "server operators",
  "print operators",
  "group policy creator owners",
  "dnsadmins",
];

export const isPrivilegedGroup = (g: string) => PRIVILEGED.includes(g.trim().toLowerCase());
export const GROUP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,63}$/;

// Groups an access request may ask for: everything used by a role template, plus EXTRA_ACCESS_GROUPS from .env
export async function knownGroups(): Promise<string[]> {
  const t = await db.roleTemplate.findMany({ select: { adGroups: true } });
  const set = new Set<string>(t.flatMap((x) => x.adGroups));
  (process.env.EXTRA_ACCESS_GROUPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((g) => set.add(g));
  return [...set].filter((g) => !isPrivilegedGroup(g)).sort((a, b) => a.localeCompare(b));
}
