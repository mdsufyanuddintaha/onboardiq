import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safeNext } from "@/lib/format";
import { loginAction } from "../actions";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import SubmitButton from "@/components/SubmitButton";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  if (await getSession()) redirect("/");
  const dev = (process.env.AUTH_MODE || "dev") !== "ad";
  const next = safeNext(searchParams.next);

  return (
    <div className="stage">
      <div className="stage-shot" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="shot-dark" src="/dashboard-dark.webp" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="shot-light" src="/dashboard-light.webp" alt="" />
      </div>
      <div className="stage-fade" aria-hidden="true" />

      <div className="stage-theme"><ThemeToggle /></div>

      <div className="stage-left">
        <div className="brand">
          <Logo />
          OnboardIQ
        </div>
        <h1 className="stage-title">Every hire, approval and access change in one place.</h1>

        <main className="glass">
          <div>
            <h2>Sign in</h2>
            <p className="muted" style={{ marginTop: 6 }}>Use your Active Directory account.</p>
          </div>

          {searchParams.error && <Alert tone="bad">{searchParams.error}</Alert>}

          <form action={loginAction} className="stack" style={{ gap: 16 }}>
            <input type="hidden" name="next" value={next} />
            <div className="field">
              <label className="label" htmlFor="username">Username</label>
              <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
            </div>
            <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
          </form>

          {dev && (
            <div className="devbox">
              <strong style={{ color: "var(--ink)" }}>Demo mode</strong>
              <div className="devbox-row"><code>hr</code><span>Submit new-hire requests, manage documents</span></div>
              <div className="devbox-row"><code>manager</code><span>Approve requests and access</span></div>
              <div className="devbox-row"><code>it</code><span>Disable accounts, grant access, view audit log</span></div>
              <div className="devbox-row"><code>auditor</code><span>Read-only audit and reports</span></div>
              <span>Password for all: <code>devpass</code>. Directory actions are simulated.</span>
            </div>
          )}
        </main>
      </div>

      <div className="stage-badges" aria-hidden="true">
        <div><b>4</b>Roles</div>
        <div><b>100%</b>Actions logged</div>
        <div><b>AES-256</b>Encrypted</div>
      </div>
    </div>
  );
}