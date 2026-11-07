// Identity mark: a ring with a centre point (a person/account), inside a rounded square.
export default function Logo({ size = 28, fixed = false }: { size?: number; fixed?: boolean }) {
  // `fixed` keeps white-on-black regardless of theme (used on the always-black sign-in panel)
  const bg = fixed ? "#fafafa" : "var(--ink)";
  const fg = fixed ? "#09090b" : "var(--on-ink)";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" style={{ fill: bg }} />
      <circle cx="16" cy="16" r="6.2" fill="none" strokeWidth="2.6" style={{ stroke: fg }} />
      <circle cx="16" cy="16" r="1.9" style={{ fill: fg }} />
    </svg>
  );
}
