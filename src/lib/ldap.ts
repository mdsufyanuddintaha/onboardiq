import { Client, Attribute, Change } from "ldapts";
import { randomInt } from "crypto";
import type { Role } from "./session";

const isDev = () => (process.env.AUTH_MODE || "dev") !== "ad";

const DEV_USERS: Record<string, { name: string; roles: Role[] }> = {
  hr: { name: "Hannah HR", roles: ["HR"] },
  manager: { name: "Mike Manager", roles: ["MANAGER"] },
  it: { name: "Ivy IT", roles: ["IT"] },
  auditor: { name: "Alex Auditor", roles: ["AUDITOR"] },
};

const GROUP_ROLE: [string, Role][] = [
  [process.env.GROUP_HR || "OnboardIQ-HR", "HR"],
  [process.env.GROUP_MANAGER || "OnboardIQ-Managers", "MANAGER"],
  [process.env.GROUP_IT || "OnboardIQ-IT", "IT"],
  [process.env.GROUP_AUDITOR || "OnboardIQ-Auditors", "AUDITOR"],
];

function client() {
  return new Client({
    url: process.env.LDAP_URL!,
    tlsOptions: { rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false" },
    timeout: 10000,
    connectTimeout: 10000,
  });
}

// Escape user input used inside an LDAP filter (prevents LDAP injection)
function esc(v: string) {
  return v.replace(/[\\*()\0]/g, (c) => "\\" + c.charCodeAt(0).toString(16).padStart(2, "0"));
}

const cnOf = (dn: string) => /^CN=([^,]+)/i.exec(dn)?.[1] ?? dn;

export async function authenticate(username: string, password: string): Promise<{ username: string; name: string; roles: Role[] } | null> {
  if (!username || !password) return null;

  if (isDev()) {
    const u = DEV_USERS[username.toLowerCase()];
    return u && password === "devpass" ? { username: username.toLowerCase(), ...u } : null;
  }

  const svc = client();
  try {
    await svc.bind(process.env.LDAP_SERVICE_DN!, process.env.LDAP_SERVICE_PASSWORD!);
    const { searchEntries } = await svc.search(process.env.LDAP_BASE_DN!, {
      scope: "sub",
      filter: `(&(objectClass=user)(sAMAccountName=${esc(username)}))`,
      attributes: ["distinguishedName", "displayName", "memberOf"],
    });
    const entry = searchEntries[0];
    if (!entry) return null;

    // Verify the password by binding as the user
    const userClient = client();
    try {
      await userClient.bind(String(entry.distinguishedName || entry.dn), password);
    } catch {
      return null;
    } finally {
      await userClient.unbind().catch(() => {});
    }

    const memberOf = ([] as string[]).concat((entry.memberOf as string[] | string | undefined) ?? []);
    const groups = memberOf.map((d) => cnOf(d).toLowerCase());
    const roles = GROUP_ROLE.filter(([g]) => groups.includes(g.toLowerCase())).map(([, r]) => r);
    if (roles.length === 0) return null; // authenticated in AD but not authorized for this app
    return { username, name: String(entry.displayName || username), roles };
  } finally {
    await svc.unbind().catch(() => {});
  }
}

function tempPassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*?"];
  const all = sets.join("");
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 16) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export type NewUser = { firstName: string; lastName: string; username: string; email: string; department: string; jobTitle: string };

// Creates the AD account (enabled, must change password at first logon) and adds it to the role's groups.
export async function provisionUser(u: NewUser, groups: string[]): Promise<{ tempPassword: string; dn: string }> {
  const pw = tempPassword();
  if (isDev()) return { tempPassword: pw, dn: `SIMULATED:CN=${u.firstName} ${u.lastName}` };

  const c = client();
  try {
    await c.bind(process.env.LDAP_SERVICE_DN!, process.env.LDAP_SERVICE_PASSWORD!);
    const cn = `${u.firstName} ${u.lastName}`;
    const dn = `CN=${cn.replace(/([,+"\\<>;=#])/g, "\\$1")},${process.env.LDAP_USERS_OU}`;
    await c.add(dn, {
      objectClass: ["top", "person", "organizationalPerson", "user"],
      cn,
      givenName: u.firstName,
      sn: u.lastName,
      displayName: cn,
      sAMAccountName: u.username,
      userPrincipalName: `${u.username}@${process.env.LDAP_UPN_SUFFIX}`,
      mail: u.email,
      department: u.department,
      title: u.jobTitle,
      userAccountControl: "514", // created disabled; password must be set before enabling
    });
    // unicodePwd must be a quoted UTF-16LE string and only works over LDAPS
    await c.modify(dn, [
      new Change({ operation: "replace", modification: new Attribute({ type: "unicodePwd", values: [Buffer.from(`"${pw}"`, "utf16le")] }) }),
    ]);
    await c.modify(dn, [
      new Change({ operation: "replace", modification: new Attribute({ type: "pwdLastSet", values: ["0"] }) }),
      new Change({ operation: "replace", modification: new Attribute({ type: "userAccountControl", values: ["512"] }) }),
    ]);
    for (const g of groups) {
      const gdn = await findGroupDn(c, g);
      if (!gdn) throw new Error(`AD group not found: ${g}`);
      await c.modify(gdn, [new Change({ operation: "add", modification: new Attribute({ type: "member", values: [dn] }) })]);
    }
    return { tempPassword: pw, dn };
  } finally {
    await c.unbind().catch(() => {});
  }
}

async function findGroupDn(c: Client, name: string) {
  const { searchEntries } = await c.search(process.env.LDAP_BASE_DN!, {
    scope: "sub",
    filter: `(&(objectClass=group)(cn=${esc(name)}))`,
    attributes: ["distinguishedName"],
  });
  return searchEntries[0] ? String(searchEntries[0].distinguishedName || searchEntries[0].dn) : null;
}

// Offboarding: disable the account and remove it from the role's groups.
export async function disableUser(username: string, groups: string[]): Promise<void> {
  if (isDev()) return;
  const c = client();
  try {
    await c.bind(process.env.LDAP_SERVICE_DN!, process.env.LDAP_SERVICE_PASSWORD!);
    const { searchEntries } = await c.search(process.env.LDAP_USERS_OU!, {
      scope: "sub",
      filter: `(&(objectClass=user)(sAMAccountName=${esc(username)}))`,
      attributes: ["distinguishedName"],
    });
    const e = searchEntries[0];
    if (!e) throw new Error(`AD user not found in OU: ${username}`);
    const dn = String(e.distinguishedName || e.dn);
    await c.modify(dn, [new Change({ operation: "replace", modification: new Attribute({ type: "userAccountControl", values: ["514"] }) })]);
    for (const g of groups) {
      const gdn = await findGroupDn(c, g);
      if (gdn) {
        await c.modify(gdn, [new Change({ operation: "delete", modification: new Attribute({ type: "member", values: [dn] }) })]).catch(() => {});
      }
    }
  } finally {
    await c.unbind().catch(() => {});
  }
}

// Access-request fulfilment: add an existing user to one AD group.
export async function addUserToGroup(username: string, group: string): Promise<void> {
  if (isDev()) return;
  const c = client();
  try {
    await c.bind(process.env.LDAP_SERVICE_DN!, process.env.LDAP_SERVICE_PASSWORD!);
    const { searchEntries } = await c.search(process.env.LDAP_BASE_DN!, {
      scope: "sub",
      filter: `(&(objectClass=user)(sAMAccountName=${esc(username)}))`,
      attributes: ["distinguishedName"],
    });
    const e = searchEntries[0];
    if (!e) throw new Error(`AD user not found: ${username}`);
    const dn = String(e.distinguishedName || e.dn);
    const gdn = await findGroupDn(c, group);
    if (!gdn) throw new Error(`AD group not found: ${group}`);
    await c.modify(gdn, [new Change({ operation: "add", modification: new Attribute({ type: "member", values: [dn] }) })]);
  } finally {
    await c.unbind().catch(() => {});
  }
}
