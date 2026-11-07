function validZone(z: string | undefined) {
  if (!z) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return z;
  } catch {
    return "UTC";
  }
}

export const tzName = validZone(process.env.APP_TIMEZONE);

export const fmtDate = (d?: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tzName }) : "—";

// For date-only values (e.g. start date) that are stored as UTC midnight
export const fmtDay = (d?: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

export const fmtDateTime = (d?: Date | null) =>
  d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tzName }) : "—";

// "5 min ago" for past times, "in 5 min" for future ones (deadlines, expiries)
export function fmtRelative(d: Date) {
  const diff = Date.now() - d.getTime();
  const s = Math.round(Math.abs(diff) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  const h = Math.round(m / 60);
  const days = Math.round(h / 24);
  if (days >= 30) return fmtDate(d);
  const text = m < 60 ? `${m} min` : h < 24 ? `${h} h` : `${days} d`;
  return diff < 0 ? `in ${text}` : `${text} ago`;
}

export const label = (s: string) => {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export function fmtHours(h: number | null) {
  if (h === null) return "–";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

// Converts a "YYYY-MM-DDTHH:mm" value typed in the app timezone into a real UTC Date.
export function zonedToUtc(local: string, tz = tzName): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const asUtc = new Date((local.length === 16 ? local + ":00" : local) + "Z");
  if (isNaN(asUtc.getTime())) return null;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(asUtc)) p[part.type] = part.value;
  const tzAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(asUtc.getTime() - (tzAsUtc - asUtc.getTime()));
}

// Build "path?query" from a base path and params ("" / undefined removes a key)
export function qs(base: string, params: Record<string, string | undefined> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

// Only allow same-site relative redirects (blocks open redirects like //evil.com or /\evil.com)
export function safeNext(v: string | null | undefined, fallback = "/") {
  if (!v || v.length > 300) return fallback;
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(v)) return fallback;
  return v;
}

export const relTime = fmtRelative;

// Milliseconds -> "12 min", "3.5 h", "2.1 d"
export const fmtDuration = (ms: number | null) => fmtHours(ms === null ? null : ms / 3_600_000);
