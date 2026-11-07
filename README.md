# OnboardIQ – Secure Employee Onboarding & Access Governance (web app)

HR submits a new-hire request → a manager approves → the app creates the Active Directory account, adds it to role-based security groups, and logs every step. Offboarding disables the account and removes group access. Every event lands in an append-only `AuditEvent` table that feeds the data warehouse / Power BI.

**Stack:** Next.js 14 (React, server actions) · Prisma · PostgreSQL 16 · Caddy (HTTPS) · Docker Compose · `ldapts` (LDAPS)

## Features

- Onboarding and offboarding workflow with manager approval and deadline tracking
- Role templates (job role → AD groups); privileged groups like Domain Admins are blocked
- Access requests (ticketing): priority, comments, status, manager approval, IT grant
- HR document vault: AES-256-GCM encrypted files, type/size/signature checks, share links with expiry and download limits, revoke
- Searchable audit log, dashboard with charts, CSV exports (audit, onboarding, access)
- White and black themes, responsive layout

## Extra settings (.env)

- `FILE_ENCRYPTION_KEY` – 64 hex characters (`openssl rand -hex 32`). If empty, a key is derived from `SESSION_SECRET`.
- `APP_TIMEZONE` – e.g. `America/Chicago`, used for offboarding deadlines.
- `EXTRA_ACCESS_GROUPS` – optional extra AD groups people may request.
- Encrypted documents live in the `vault` Docker volume.

If you upgrade from an older version and the database errors on start, run `docker compose down -v` once (this wipes local data) and start again.

## Roles (mapped from AD groups)

| Role | AD group (default) | Can do |
|---|---|---|
| HR | `OnboardIQ-HR` | Create new-hire requests, schedule offboarding |
| Manager | `OnboardIQ-Managers` | Approve/reject (approval triggers AD provisioning). Cannot approve own request |
| IT | `OnboardIQ-IT` | Execute account disable, view audit log |
| Auditor | `OnboardIQ-Auditors` | View audit log |

Role checks run inside every server action (`requireRole`), not only in the UI.

## Run locally (dev mode, no Active Directory needed)

```bash
cp .env.example .env        # set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)
# keep AUTH_MODE=dev, and set COOKIE_SECURE=false if you browse over http
docker compose up --build
```
Open https://localhost (accept the self-signed cert). Sign in as `hr`, `manager`, `it` or `auditor` with password `devpass`. In dev mode, AD actions are simulated.

Demo flow: **hr** creates a request → **manager** approves (temp password shown once) → **hr** schedules offboarding → **it** disables the account → **auditor** reviews the log.

## Deploy on the Azure Linux VM

1. Install Docker + Compose plugin on the Ubuntu VM. Copy this folder over.
2. `.env`: set `SITE_ADDRESS` to your public DNS name (e.g. `onboardiq.<region>.cloudapp.azure.com`) so Caddy gets a free Let's Encrypt cert. Keep `COOKIE_SECURE=true`.
3. NSG: allow only 80/443 inbound from the internet; SSH only from your IPs. Port 5432 is never published (see `docker-compose.yml`).
4. `docker compose up -d --build`

## Switch to real Active Directory (`AUTH_MODE=ad`)

1. On the domain controller (Windows Server 2022), enable **LDAPS (636)** with a server certificate (AD CS or a lab cert). Account creation and password set **require LDAPS**.
2. Create the four groups above, an OU (e.g. `OnboardIQ Users`), and the role-template groups seeded in `prisma/seed.mjs` (`SG-Engineering`, `SG-HR`, …). Edit the seed to match your real groups.
3. Create `svc-onboardiq` and **delegate** only: create/delete user objects in that OU, reset password, write user attributes, and modify membership of the target groups. Do **not** make it a Domain Admin.
4. Fill in the `LDAP_*` values in `.env`. If the DC cert is not trusted by the VM, import the CA into the container, or (lab only) set `LDAP_TLS_REJECT_UNAUTHORIZED=false`.
5. Put your test users into the `OnboardIQ-*` groups. Users who authenticate but hold none of these groups are denied.

## Security notes

- LDAP filter input is escaped; passwords are verified by binding as the user.
- Session = signed JWT in an HttpOnly, SameSite cookie. Login throttling after 5 failures.
- Temporary passwords are random, shown once, never stored, and must be changed at first logon.
- Separation of duties: requester ≠ approver. All actions audited, including failures.
- Security headers via `next.config.js`; HSTS via Caddy.

## ETL / warehouse hook

Read `AuditEvent` and `Request` from Postgres (read-only DB role recommended) and load them into the SQL Server star schema. Useful derived measures: time from request to `ACCOUNT_CREATED`, and `ACCOUNT_DISABLED_ON_TIME` vs `ACCOUNT_DISABLED_LATE`.

## Known limits (good items for your risk register)

- `prisma db push` is used instead of migrations to keep setup simple.
- Login throttling is in-memory (resets on restart, per instance).
- No CSRF token beyond Next.js server-action origin checks and SameSite cookies.
