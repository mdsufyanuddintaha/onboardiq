import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type Role = "HR" | "MANAGER" | "IT" | "AUDITOR";
export type Session = { username: string; name: string; roles: Role[] };

const COOKIE = "oiq_session";
const key = () => {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.startsWith("change-me"))) {
    throw new Error("SESSION_SECRET must be set to a long random value (openssl rand -hex 32)");
  }
  return new TextEncoder().encode(secret || "dev-only-secret-change-me");
};

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("8h").sign(key());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export function destroySession() {
  cookies().delete(COOKIE);
}

export function hasRole(s: Session | null, ...roles: Role[]) {
  return !!s && s.roles.some((r) => roles.includes(r));
}

// Enforced in every server action, not just hidden in the UI.
export async function requireRole(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s || !hasRole(s, ...roles)) throw new Error("Forbidden");
  return s;
}
