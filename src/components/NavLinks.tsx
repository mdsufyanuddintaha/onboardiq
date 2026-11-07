"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";

export type NavItem = { href: string; label: string; icon: IconName; group: string; badge?: number };

export default function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const groups = Array.from(new Set(items.map((i) => i.group)));
  return (
    <nav className="nav" aria-label="Main">
      {groups.map((g) => (
        <div className="nav-group" key={g}>
          <div className="nav-title">{g}</div>
          {items
            .filter((i) => i.group === g)
            .map((i) => {
              const active = i.href === "/" ? path === "/" : path === i.href || path.startsWith(i.href + "/");
              return (
                <Link key={i.href} href={i.href} className={"nav-link" + (active ? " active" : "")} aria-current={active ? "page" : undefined}>
                  <Icon name={i.icon} />
                  <span>{i.label}</span>
                  {i.badge ? <span className="nav-badge" aria-label={`${i.badge} waiting`}>{i.badge}</span> : null}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
