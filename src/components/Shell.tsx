import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "@/lib/session";
import { can, ROLE_LABEL } from "@/lib/perm";
import { logoutAction } from "@/app/actions";
import NavLinks, { type NavItem } from "./NavLinks";
import ThemeToggle from "./ThemeToggle";
import Logo from "./Logo";
import Icon from "./Icon";
import { Avatar } from "./ui";

export type Badges = { requests: number; access: number };

function navItems(s: Session, badges: Badges): NavItem[] {
  const items: NavItem[] = [
    { href: "/", label: "Overview", icon: "home", group: "Workspace" },
    { href: "/requests", label: "Onboarding", icon: "users", group: "Workspace", badge: badges.requests },
    { href: "/access", label: "Access requests", icon: "key", group: "Workspace", badge: badges.access },
  ];
  if (can(s, "docsView")) items.push({ href: "/documents", label: "Document vault", icon: "lock", group: "Records" });
  if (can(s, "viewAudit")) items.push({ href: "/audit", label: "Audit log", icon: "shield", group: "Records" });
  items.push({ href: "/templates", label: "Role templates", icon: "layers", group: "Records" });
  return items;
}

export default function Shell({ session, badges, children }: { session: Session; badges: Badges; children: ReactNode }) {
  const items = navItems(session, badges);
  const roles = session.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ");
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>

      <aside className="rail">
        <Link href="/" className="brand">
          <Logo />
          OnboardIQ
        </Link>
        <NavLinks items={items} />
        <div className="rail-foot">
          <div className="me">
            <Avatar name={session.name} />
            <div style={{ minWidth: 0 }}>
              <div className="me-name">{session.name}</div>
              <div className="me-role">{roles}</div>
            </div>
          </div>
          <div className="rail-actions">
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="btn" type="submit">
                <Icon name="logout" size={16} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="mbar">
        <Link href="/" className="brand">
          <Logo size={26} />
          OnboardIQ
        </Link>
        <ThemeToggle />
        <details className="mmenu">
          <summary className="iconbtn" aria-label="Open menu">
            <Icon name="menu" />
          </summary>
          <div className="mmenu-pop">
            <NavLinks items={items} />
            <div className="me" style={{ padding: "8px 10px" }}>
              <Avatar name={session.name} />
              <div>
                <div className="me-name">{session.name}</div>
                <div className="me-role">{roles}</div>
              </div>
            </div>
            <form action={logoutAction}>
              <button className="btn" type="submit" style={{ width: "100%" }}>Sign out</button>
            </form>
          </div>
        </details>
      </header>

      <main className="main" id="main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
