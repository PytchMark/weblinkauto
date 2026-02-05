# Auto Concierge Jamaica - Product Requirements Document

## Original Problem Statement
Build a production-ready dealer inventory + lead engine SaaS platform with:
- Public Storefront for buyers to browse dealer inventory
- Dealer Portal for inventory/media/requests management
- Admin Portal for global dealer management
- Landing/Funnel page for SaaS onboarding with Stripe subscriptions

## User Personas
1. **Buyers** - Browse inventory via public storefront, make viewing requests
2. **Dealers** - Manage inventory, media, and respond to requests
3. **Admin (Platform Owner)** - Manage all dealers, view analytics, override settings

## Core Requirements
- Public storefront accessible via URL path `/DEALER-0001`
- Dealer-specific inventory (not marketplace)
- JWT-based authentication for dealer/admin portals
- Stripe subscriptions: Tier 1 ($45/mo), Tier 2 ($75/mo), Tier 3 ($98/mo)
- 14-day free trial
- Cloudinary media uploads (7 images + 3 videos per vehicle)
- WhatsApp integration for lead routing
- Request types: WhatsApp Chat, Live Video Viewing, Book Walk-In

## Tech Stack
- **Backend**: Node.js/Express on Google Cloud Run
- **Database**: Supabase (PostgreSQL)
- **Media**: Cloudinary
- **Payments**: Stripe Subscriptions
- **Frontend**: Vanilla HTML/CSS/JS static apps

---

## What's Been Implemented

### January 2026
- [x] Complete Node.js/Express server with full API
- [x] Supabase integration with profiles, vehicles, viewing_requests tables
- [x] Stripe checkout + webhook handling for subscription provisioning
- [x] 4 static HTML apps (storefront, dealer, admin, landing)
- [x] JWT authentication for dealer/admin portals
- [x] Cloudinary media upload infrastructure
- [x] User-provided logo integrated across all pages
- [x] Crimson (#DC143C) color scheme applied
- [x] Marquee strips with trust phrases
- [x] Animated CTA buttons ("Get Listed!" ↔ "Become a Dealer")
- [x] "Make Request" modal with 3 request types
- [x] Graceful fallback for mock mode (development without real credentials)
- [x] Comprehensive README with deployment instructions

---

## Prioritized Backlog

### P0 (Before Launch)
- [ ] Configure real Supabase credentials in Cloud Run
- [ ] Configure real Stripe API keys and create products/prices
- [ ] Set up Stripe webhook endpoint in production
- [ ] Update admin credentials for production

### P1 (Launch Week)
- [ ] Add email notifications for new dealer signups
- [ ] Implement dealer passcode reset flow
- [ ] Add inventory limits by tier (24/124/unlimited)

### P2 (Post-Launch)
- [ ] Analytics dashboard with charts
- [ ] Multi-currency support (USD/JMD)
- [ ] SMS notifications via Twilio
- [ ] Mobile app (React Native)

---

## Next Action Items
1. Deploy to Cloud Run with production environment variables
2. Create Stripe products/prices for the 3 tiers
3. Configure webhook endpoint: `POST /api/stripe/webhook`
4. Test complete flow: Landing → Checkout → Dealer creation
5. Seed initial test dealer for demo purposes
