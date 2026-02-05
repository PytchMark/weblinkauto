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
- **Email**: Gmail SMTP
- **Frontend**: Vanilla HTML/CSS/JS static apps

---

## What's Been Implemented

### February 2026 - Production Features v2.0
- [x] #1 Automated Welcome Email - Sends dealer credentials after signup
- [x] #2 New Request Email Alerts - Notifies dealers instantly on new requests
- [x] #4 Low Inventory Alert - Warns dealers when stock is low
- [x] #5 Failed Payment Recovery - Email when subscription payment fails
- [x] #6 & #7 Upgrade Prompts - Smart upsell emails based on usage
- [x] #8 Referral Program - Earn free months by referring dealers
- [x] #9 Passcode Reset Flow - Email-based password recovery
- [x] #11 Session Timeout - Auto-logout after 30min inactivity
- [x] #12 Rate Limiting - Protects login endpoints from brute force
- [x] #22 Dealer Suspension Flow - Graceful handling of lapsed subscriptions
- [x] #23 Export to CSV - Download dealers/vehicles/requests data
- [x] #24 Bulk Status Update - Mass update vehicle statuses
- [x] #26 Social Share Buttons - Share vehicles to WhatsApp/Facebook
- [x] #27 SEO Meta Tags - Open Graph & Twitter Card support
- [x] #28 QR Code Generator - API endpoint for dealer storefront QR codes

### January 2026 - Initial MVP
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

---

## Prioritized Backlog

### P0 (Before Launch)
- [ ] Configure real Supabase credentials in Cloud Run
- [ ] Configure real Stripe API keys and create products/prices
- [ ] Set up Stripe webhook endpoint in production
- [ ] Configure Gmail SMTP credentials for email notifications
- [ ] Update admin credentials for production

### P1 (Launch Week)
- [ ] Add email notifications for successful payment confirmation
- [ ] Implement inventory limits by tier (24/124/unlimited)
- [ ] Add analytics charts to dealer dashboard

### P2 (Post-Launch)
- [ ] Multi-currency support (USD/JMD)
- [ ] SMS notifications via Twilio
- [ ] Mobile PWA support
- [ ] Dark mode toggle

---

## New API Endpoints Added (v2.0)
- `POST /api/dealer/request-reset` - Request passcode reset email
- `POST /api/dealer/reset-passcode` - Set new passcode with token
- `GET /api/public/qrcode/:dealerId` - Generate QR code for storefront
- `GET /api/admin/export/dealers` - Export dealers to CSV
- `GET /api/admin/export/vehicles` - Export vehicles to CSV
- `GET /api/admin/export/requests` - Export requests to CSV
- `POST /api/admin/vehicles/bulk-update` - Bulk update vehicle statuses
- `POST /api/admin/check-alerts` - Trigger alert email checks

---

## Next Action Items
1. Deploy to Cloud Run with production environment variables
2. Create Stripe products/prices for the 3 tiers
3. Configure webhook endpoint: `POST /api/stripe/webhook`
4. Set up Gmail App Password for email notifications
5. Test complete flow: Landing → Checkout → Dealer creation → Welcome Email
