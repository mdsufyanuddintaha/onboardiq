import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { getSession, hasRole } from "@/lib/session";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: { default: "OnboardIQ", template: "%s · OnboardIQ" },
  description: "Employee onboarding and access governance",
};
export const dynamic = "force-dynamic";

// Applies the saved (or system) white/black theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem("oiq-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const s = await getSession();
  let badges = { requests: 0, access: 0 };
  if (s) {
    const [requests, access] = await Promise.all([
      hasRole(s, "MANAGER") ? db.request.count({ where: { status: "PENDING_APPROVAL" } }) : Promise.resolve(0),
      hasRole(s, "MANAGER")
        ? db.accessRequest.count({ where: { status: "OPEN", NOT: { requestedBy: s.username } } })
        : hasRole(s, "IT")
        ? db.accessRequest.count({ where: { status: "APPROVED" } })
        : Promise.resolve(0),
    ]);
    badges = { requests, access };
  }
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{s ? <Shell session={s} badges={badges}>{children}</Shell> : children}</body>
    </html>
  );
}
