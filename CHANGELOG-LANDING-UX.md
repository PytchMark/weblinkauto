# Landing & storefront UX changelog

## Summary

This release moves dealer “about” content into a modal on the storefront, stops showing per-vehicle hero video to buyers, and reshapes the landing page into a clearer free-vs-paid path with plain language.

## Storefront

- **About dealer modal**: Profile, map, socials, reviews, and report now open from an “About this dealer” button in the dealer bar instead of a long inline section above inventory.
- **Gallery-first images**: Request modal and cards use uploaded gallery photos only; vehicle-level hero image/video are ignored on the buyer side (dealer portal upload fields unchanged).
- **Page-level dealer hero video**: Still supported for dealer branding on the storefront hero.

## Landing funnel

- **Section order**: Hero → two plans (`#programs`) → comparison (`#tierCompare`) → feature blocks → three setup steps → trust strip → WhatsApp → FAQ.
- **Plain copy**: Free plan explains that our team handles buyer chats and notifies you when a sale is ready; paid plan focuses on direct leads and your own page.
- **Four-row compare grid**: Listing speed, messages, closing sales, and cost — each with Free vs Paid columns; compact fee table kept below.
- **Rich feature blocks**: Icon, copy, short proof line, CTA, and 4:3 image per block.
- **Trust strip**: Stripe, verified dealers, setup speed, and a labeled example quote.
- **Branded loader**: `acj-loader.css` / `acj-loader.js` on landing, storefront, dealer, and admin; respects `prefers-reduced-motion`.

## Landing SaaS funnel upgrade (v2)

- **Two-column plan compare** (`#tierCompare`): Free and Paid cards with four icon bullets each; `<details>` accordions explain each inventory-manager benefit; compact fee table below.
- **Programs alignment**: Price cards use the same four icon bullets as the compare section.
- **Icon-rich feature blocks**: Each block has a bold `h2`, lead line, 4 sub-benefits (icon + title + line), proof, dual CTAs, and 4:3 image; alternating `feature-block--light` (white) and `feature-block--brand` (red gradient).
- **Financing flagship** (`#financing`): Full-width brand section with four sub-benefits, dual CTAs (WhatsApp + compare), mini FAQ accordions, and hero image; removed thin banner from compare.
- **Motion**: GSAP stagger on `.benefit-point` and plan columns; subtle parallax on `.parallax-img` when motion is allowed.
- **Loader v2**: Logo fade-in, status line cycle, pulse on internal navigation.

## QA notes

- Load a dealer on `/storefront?dealer=…` — About button enables; modal reviews and report work; inventory starts without scrolling past profile.
- Open a vehicle request — image only, no listing video.
- Landing CTAs: `btnWaitlist`, `btnPaidCheckout`, WhatsApp links, anchor jumps with sticky header (`scroll-padding-top`).
- Test internal links between `/landing`, `/storefront`, `/dealer`, `/admin` for loader; external Stripe/WhatsApp should not show loader.
- Mobile: bottom bar should not cover form fields (`padding-bottom` on body).
- Compare accordions open with keyboard; plan columns stack on narrow screens.
- Financing WhatsApp link uses financing-specific prefill message.
- Every feature block shows at least four icon sub-points and one image.

## Files

- `apps/storefront/index.html`
- `apps/landing/index.html`
- `public/assets/css/acj-brand.css`
- `public/assets/css/acj-loader.css`
- `public/assets/js/acj-loader.js`
