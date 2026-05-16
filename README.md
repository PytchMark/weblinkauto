# Auto Concierge Jamaica (Weblinkauto)

Multi-dealer inventory, storefront, dealer portal, and admin console. Express API on Cloud Run, Supabase Postgres, Cloudinary media, Stripe subscriptions, and **Resend** transactional email.

---

## Apps and URLs

| App | URL | Audience |
|-----|-----|----------|
| Landing | `/landing` | Prospective dealers |
| Storefront | `/storefront` or `/{DEALER-ID}` | Car buyers |
| Dealer portal | `/dealer` | Dealers |
| Admin | `/admin` | Internal team |

Site root `/` redirects to `/storefront`.

---

## Admin console tabs

| Tab | Purpose |
|-----|---------|
| **Dealers** | Create/edit dealers, passcode reveal, custom passcode, email welcome, notify dealer |
| **Applications** | Free-tier waitlist (approve → create dealer) |
| **Summary** | Monthly KPIs for all dealers |
| **Inventory** | All vehicles, bulk status update |
| **Requests** | Viewing / lead requests |
| **Settings** | Environment reference |

### Dealer actions (Dealers tab + editor modal)

- **Work email** — used for welcome, passcode, and custom notifications (Resend).
- **Email login details** — checkbox on create; sends welcome email with Dealer ID + passcode.
- **Reveal** — fetches current passcode from API (admin only).
- **Save custom** — set passcode via editor field.
- **Generate new** — random passcode; optional **Email on reset**.
- **Notify dealer** — one-off subject/message email.

---

## Environment variables

Copy [`.env.example`](.env.example) to `.env` for local dev. Set the same keys on **Cloud Run** for production.

### Required for production

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side DB access |
| `JWT_SECRET` | Dealer/admin session tokens (32+ random chars) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin login |
| `CLOUDINARY_*` | Image/video uploads |
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_PRICE_PAID` | $98/mo price ID |
| `STRIPE_WEBHOOK_SECRET` | Checkout webhooks |
| `RESEND_API_KEY` | Email delivery ([resend.com](https://resend.com)) |
| `EMAIL_FROM` | Verified sender on Resend domain |
| `APP_BASE_URL` | Links in emails (e.g. `https://your-domain.com`) |

### Recommended

| Variable | Purpose |
|----------|---------|
| `SALES_TEAM_INBOX_EMAIL` | Waitlist + free-tier leads + dealer reports |
| `CASH_CLOSERS_WHATSAPP_E164` | WhatsApp for free-tier routing |
| `EMAIL_FROM_NAME` | Display name (default: Auto Concierge Jamaica) |
| `EMAIL_REPLY_TO` | Reply-to address |
| `BCC_DEALER_ON_FREE_LEADS` | Set `1` to BCC dealer on free-tier lead emails |

### Optional

| Variable | Purpose |
|----------|---------|
| `ADMIN_API_KEY` | Header `x-admin-key` bypass |
| `ADMIN_USERNAME` | Fallback admin username |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `STRIPE_PRICE_TIER1`–`TIER3` | Legacy price IDs |

**Note:** Email is **Resend only** (not Gmail SMTP).

---

## Supabase setup

There is no `supabase/migrations/` folder. Apply schema in the Supabase SQL editor:

1. Run the full script: [`supabase_schema.sql`](supabase_schema.sql)
2. For existing projects, re-run the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` blocks and the new tables at the bottom:
   - `dealer_reviews` — buyer star ratings on storefront
   - `dealer_reports` — buyer “Report Dealer” submissions

Tables: `profiles`, `vehicles`, `viewing_requests`, `dealer_applications`, `dealer_reviews`, `dealer_reports`.

---

## Email checklist (Resend)

1. Create a Resend account and verify your sending domain.
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `notifications@yourdomain.com`).
3. Set `APP_BASE_URL` to your public URL.
4. Test flows:
   - Create dealer with email + “Email login details” → welcome email
   - Reset passcode with “Email on reset”
   - Notify dealer from admin modal
   - Stripe paid signup → welcome email (existing)
   - Submit “Report Dealer” on storefront → alert to `SALES_TEAM_INBOX_EMAIL`

---

## Dealer portal highlights

- **Stock number** auto-generated if left blank when saving a vehicle.
- Status **Ready for Import** plus On the lot, Pending, Sold, Archived.
- **Photos** via upload buttons only (no URL paste fields).
- **Videos** on listings: **paid plan only** (upload + save blocked on free tier).
- Plain-language labels throughout.

---

## Storefront highlights

- Buyer-focused marquee and dealer profile card before inventory.
- Interactive **Give us a review** (1–5 stars) and **Report Dealer**.
- Logo links to `/storefront`; **Dealer login** in header.

---

## Local development

```bash
cp .env.example .env
# Fill Supabase, JWT, admin, Cloudinary, Resend, Stripe as needed
npm install
npm start
```

Open `http://localhost:8080/landing`, `/dealer`, `/admin`, `/storefront`.

---

## Post-deploy smoke test

- [ ] Free dealer: add vehicle with empty stock number → saves successfully
- [ ] Admin: create dealer with email → welcome email received
- [ ] Admin: reveal / custom / generate passcode
- [ ] Landing: hero video plays; feature blocks and red step cards work
- [ ] Storefront: load paid dealer → profile card, reviews, inventory
- [ ] Paid dealer: upload vehicle video; free dealer cannot
- [ ] Report dealer → row in `dealer_reports` + sales inbox email (if configured)

---

## Architecture

Browsers call **Express only** (no direct Supabase from the client). Secrets stay in environment variables. Dealer data is scoped by `dealer_id` on the server.
