# Setup & deployment guide

Use this checklist when deploying the latest **ACJ Marketplace**, **In Transit / Reserved** vehicle statuses, landing updates, and motion fixes to an existing Supabase + Cloud Run environment.

For full product docs, see [README.md](README.md).

---

## 1. Environment variables

Copy [`.env.example`](.env.example) to `.env` locally. Set the same keys on **Cloud Run** (or your host) for production.

### Required (production)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access (never expose in the browser) |
| `JWT_SECRET` | Dealer/admin session tokens (32+ random characters) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin console login |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Media uploads |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_PRICE_PAID` | $98/mo paid plan price ID |
| `STRIPE_WEBHOOK_SECRET` | Stripe checkout webhooks |
| `RESEND_API_KEY` | Transactional email |
| `EMAIL_FROM` | Verified sender on your Resend domain |
| `APP_BASE_URL` | Public site URL (links in emails and QR codes), e.g. `https://autoconciergeja.com` |

### Recommended

| Variable | Purpose |
|----------|---------|
| `SALES_TEAM_INBOX_EMAIL` | Waitlist, free-tier leads, sell-your-car submissions |
| `CASH_CLOSERS_WHATSAPP_E164` | WhatsApp for free-tier routing |
| `EMAIL_FROM_NAME` | Default: `Auto Concierge Jamaica` |
| `EMAIL_REPLY_TO` | Reply-to on outbound mail |
| `BCC_DEALER_ON_FREE_LEADS` | Set `1` to BCC dealer on free-tier lead emails |

### Marketplace & storefront (optional)

| Variable | Purpose |
|----------|---------|
| `MARKETPLACE_RESERVATION_DEPOSIT_PCT` | Default reservation deposit % when a dealer has no `reservation_deposit_pct` on their profile (e.g. `10`) |
| `MARKETPLACE_REQUIRE_QUALITY` | Set `1` or `true` to only list vehicles with `acj_quality_verified = true` on `/marketplace` |

### Other optional

| Variable | Purpose |
|----------|---------|
| `ADMIN_API_KEY` | Header `x-admin-key` for admin API bypass |
| `ADMIN_USERNAME` | Fallback admin username |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `PORT` | Server port (default `8080`) |
| `NODE_ENV` | `production` on Cloud Run |

**Email:** Resend only (not Gmail SMTP).

---

## 2. SQL migrations (existing Supabase project)

Run these in **Supabase Dashboard → SQL → New query**, in order. Each script is idempotent (`IF NOT EXISTS`).

### Step 1 — Vehicle hero columns

**File:** [`scripts/migrate-vehicles-hero-columns.sql`](scripts/migrate-vehicles-hero-columns.sql)

Required if dealer save fails with missing `hero_image_url` / `hero_video_url`.

```sql
alter table vehicles add column if not exists hero_image_url text;
alter table vehicles add column if not exists hero_video_url text;
```

**Verify:**

```sql
select column_name from information_schema.columns
where table_name = 'vehicles'
  and column_name in ('hero_image_url', 'hero_video_url');
```

### Step 2 — Marketplace & sell-your-car

**File:** [`scripts/migrate-marketplace.sql`](scripts/migrate-marketplace.sql)

Adds financing flags, quality gate, listing date, dealer reservation %, and `sell_submissions` table.

**Verify:**

```sql
select column_name from information_schema.columns
where table_name = 'vehicles'
  and column_name in ('financing_available', 'acj_quality_verified', 'listed_at');
select column_name from information_schema.columns
where table_name = 'profiles' and column_name = 'reservation_deposit_pct';
select to_regclass('public.sell_submissions');
```

### Step 3 — In Transit & Reserved (paid plan)

**File:** [`scripts/migrate-vehicle-status-scheduling.sql`](scripts/migrate-vehicle-status-scheduling.sql)

### Step 4 — Marketplace opt-in per vehicle

**File:** [`scripts/migrate-vehicle-marketplace-opt-in.sql`](scripts/migrate-vehicle-marketplace-opt-in.sql)

Adds `show_in_marketplace` so verified free-plan dealers can choose which units appear on `/marketplace`. When `MARKETPLACE_REQUIRE_QUALITY=1`, ACJ must still approve via `acj_quality_verified`.

**Verify:**

```sql
select column_name from information_schema.columns
where table_name = 'vehicles' and column_name = 'show_in_marketplace';
```

Enables **In Transit** (`expected_arrival_at`) and **Reserved** (`reserved_until`) on vehicles for paid storefront dealers.

```sql
alter table vehicles add column if not exists expected_arrival_at timestamptz;
alter table vehicles add column if not exists reserved_until timestamptz;
```

**Verify:**

```sql
select column_name from information_schema.columns
where table_name = 'vehicles'
  and column_name in ('expected_arrival_at', 'reserved_until');
```

### New empty database

Run the full [`supabase_schema.sql`](supabase_schema.sql) once instead of the steps above.

---

## 3. Deploy checklist

| Order | Action | Where |
|-------|--------|--------|
| 1 | Pull / merge latest `main` | GitHub |
| 2 | Run `migrate-vehicles-hero-columns.sql` | Supabase SQL Editor |
| 3 | Run `migrate-marketplace.sql` | Supabase SQL Editor |
| 4 | Run `migrate-vehicle-status-scheduling.sql` | Supabase SQL Editor |
| 5 | Run `migrate-vehicle-marketplace-opt-in.sql` | Supabase SQL Editor |
| 6 | Confirm env vars (especially `APP_BASE_URL`, Stripe, Resend) | Cloud Run |
| 7 | Deploy API + static apps | Cloud Run |
| 8 | Hard-refresh browsers | Landing, dealer, storefront |

---

## 4. Post-deploy smoke tests

- [ ] **Dealer** — Add/edit vehicle, upload photos, save (no hero column errors)
- [ ] **Paid dealer** — Set status **In Transit** (arrival date) or **Reserved** (end time / duration); ribbons show on storefront
- [ ] **Storefront** — `/{dealer-id}` loads inventory; paid dealer QR endpoint works if exposed in portal
- [ ] **Marketplace** — `/marketplace` loads aggregated listings; reserve modal and sell-your-car form submit
- [ ] **Admin** — Sell submissions tab lists new rows
- [ ] **Landing** — Plans block shows paid benefits; scroll animations feel responsive

---

## 5. Local development

```bash
cp .env.example .env
# Fill Supabase, JWT, admin, Cloudinary, Resend, Stripe
npm install
npm start
```

Open `http://localhost:8080/landing`, `/dealer`, `/admin`, `/storefront`, `/marketplace`.
