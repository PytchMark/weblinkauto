# Auto Concierge Jamaica

A multi-dealer car inventory and viewing-request SaaS platform built with:

- **Google Cloud Run** (Express API)
- **Supabase (Postgres)** (single source of truth database)
- **Cloudinary** (media hosting)
- **Static HTML apps** (storefront, dealer portal, admin)
- **Stripe** (SaaS subscriptions + dealer provisioning)

This system installs a **sales process**, not just a website.

---

## 🚀 Production Readiness Checklist

### ✅ Completed
- [x] JWT-based authentication for dealer & admin portals
- [x] Stripe integration for SaaS subscriptions (Tier 1-3)
- [x] 14-day free trial support
- [x] Cloudinary media uploads (7 images + 3 videos per vehicle)
- [x] WhatsApp integration for lead routing
- [x] Request management system (Video Viewing, Walk-In, WhatsApp)
- [x] Admin dashboard with dealer drill-down
- [x] Landing page with pricing and CTA animations
- [x] Crimson branding (#DC143C) applied throughout
- [x] Auto Concierge logo integrated across all pages

### 🔧 Before Go-Live
1. Add real Supabase credentials to Cloud Run environment
2. Add real Stripe API keys and create products/prices
3. Configure Stripe webhook endpoint
4. Update ADMIN_EMAIL and ADMIN_PASSWORD for production
5. Set a strong JWT_SECRET (at least 32 random characters)
6. Configure Cloudinary API keys

---

## Architecture Overview


- Browsers **never** talk to Supabase directly
- All secrets live in environment variables
- All dealer access is scoped by `Dealer ID`

---

## Apps

### `/apps/storefront`
Public, read-only dealer storefront.

- User enters a **Dealer ID** (or via URL param)
- Displays live inventory from Supabase
- Allows customers to:
  - Open WhatsApp chat
  - Request live video viewing
  - Book in-store viewing

No authentication required.

---

### `/apps/dealer`
Dealer management portal.

- Login with **Dealer ID + passcode**
- Manage vehicles and media
- Upload images/videos to Cloudinary
- Update vehicle status:
  - Available
  - Pending
  - Sold
  - Archived (no deletes)

Dealers can only access their own data.

---

### `/apps/admin`
Internal admin dashboard.

- View all dealers
- View all vehicles
- View all requests
- Sales + performance analytics
- Filter by Dealer ID

---

### `/apps/landing`
Dealer onboarding funnel.

- Stripe checkout with a 14-day free trial
- Tiered pricing: Tier 1 ($45/mo), Tier 2 ($75/mo), Tier 3 ($98/mo)
- Automatic dealer provisioning after checkout

---

## Repository Structure

/
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
│
├── apps/
│ ├── storefront/index.html
│ ├── dealer/index.html
│ ├── admin/index.html
│ └── landing/index.html
│
├── services/
│ ├── supabase.js
│ ├── auth.js
│ └── analytics.js
│
└── public/assets/


---

## Environment Variables

Create a local `.env` file (not committed) based on `.env.example`.

In production:
- Use **Cloud Run environment variables** or **Google Secret Manager**
- Never commit real secrets to GitHub

### Required env vars

Supabase
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)

Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_TIER1`
- `STRIPE_PRICE_TIER2`
- `STRIPE_PRICE_TIER3`

App + Cloudinary
- `APP_BASE_URL` (e.g. `https://autoconciergeja.com`)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_FOLDER` (optional; default uses dealerId/vehicleId)
- `CLOUDINARY_BASE_FOLDER` (optional alias for folder template)

Admin auth
- `ADMIN_EMAIL` or `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_API_KEY` (optional)
- `JWT_SECRET`

Supabase schema setup:
- Apply `supabase_schema.sql` in the Supabase SQL editor before running the API.

### Stripe setup checklist
1. Create Stripe products + prices for:
   - Tier 1: **$45/mo**
   - Tier 2: **$75/mo**
   - Tier 3: **$98/mo**
2. Store price IDs in `STRIPE_PRICE_TIER1`, `STRIPE_PRICE_TIER2`, `STRIPE_PRICE_TIER3`.
3. Set a 14-day trial in Stripe (or allow app-side trial via webhook).
4. Configure webhook endpoint:
   - `POST https://<your-domain>/api/stripe/webhook`
5. Local webhook testing with Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:8080/api/stripe/webhook
   ```
6. Confirm provisioning:
   - Complete checkout on `/landing`
   - Check Supabase `profiles` for new dealer row (dealer_id, stripe ids, trial_ends_at).

### Supabase schema additions
If your Supabase schema is missing any of the fields below, apply these SQL statements:

```sql
alter table profiles add column if not exists plan text;
alter table profiles add column if not exists trial_ends_at timestamptz;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists stripe_subscription_id text;
alter table profiles add column if not exists stripe_subscription_status text;

alter table vehicles add column if not exists hero_image_url text;
alter table vehicles add column if not exists hero_video_url text;
```

### New API endpoints
- `POST /api/stripe/create-checkout-session`
- `POST /api/stripe/webhook`
- `GET /api/public/checkout-session?sessionId=...`
- `GET /api/public/dealer?dealerId=...`

---

## Data Rules (Important)

- **Dealer ID** is the partition key for all data
- Vehicles are **never deleted**, only archived
- Media is hosted on Cloudinary
- Supabase stores:
  - Cloudinary URLs for images/videos
- Dropdown / status values are enforced to keep data clean

---

## Status Values

Vehicles:
- `Available`
- `Pending`
- `Sold`
- `Archived`

Requests:
- `New`
- `Contacted`
- `Booked`
- `Closed`
- `No Show`

---

## Footer Requirement

All apps must display:


---

## Development

Install dependencies:
```bash
npm install
```

Run the server locally:
```bash
npm run dev
```

---

## Cloud Run deployment notes

### Environment Variables for Production
Set these in Google Cloud Run > Edit & Deploy > Variables & Secrets:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
STRIPE_PRICE_TIER1=price_xxxTier1
STRIPE_PRICE_TIER2=price_xxxTier2
STRIPE_PRICE_TIER3=price_xxxTier3

# App
APP_BASE_URL=https://autoconciergeja.com
JWT_SECRET=your-strong-random-secret-32-chars-minimum

# Admin
ADMIN_EMAIL=your-admin@email.com
ADMIN_PASSWORD=your-secure-password

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### Deployment Steps
1. Push code to GitHub
2. Connect Cloud Run to your repository
3. Set environment variables
4. Deploy and verify health endpoint: `GET /health`
5. Configure Stripe webhook to point to: `https://your-domain/api/stripe/webhook`
6. Test complete flow: Landing → Checkout → Dealer creation

### Stripe Webhook Events to Enable
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

---

## Support

For assistance, contact the Auto Concierge Jamaica team.
