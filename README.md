# Vaulture Website

Static launch website for Vaulture, an Australian Pokémon TCG business.

## Owner Configuration

Replace these placeholders before launch:

```text
FORM_ENDPOINT=https://formspree.io/f/meeyyknp
WHATNOT_URL=https://www.whatnot.com/en-AU/user/vaulture
EBAY_URL=https://www.ebay.com.au/usr/vaultureau
```

Current public email addresses:

```text
hello@vaulture.com.au
sell@vaulture.com.au
support@vaulture.com.au
```

## Marketplace Sales Activity

The homepage activity widget reads from `data/sales-feed.json`. A GitHub Action updates that file from eBay's Fulfillment API, merges it with anonymised marketplace CSV backfills and only publishes privacy-safe activity:

- no buyer names
- no buyer usernames
- no addresses
- no seller IDs
- no order IDs
- no shipment IDs
- no prices
- no fees

Add these repository secrets in GitHub before running the workflow:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REFRESH_TOKEN`

The refresh token must be a user token consented with the `sell.fulfillment.readonly` scope. The workflow can be run manually from GitHub Actions and also runs hourly. The workflow safely syncs recent eBay API orders, merges them with the anonymised CSV backfill, then publishes a 24-month anonymised monthly chart plus recent anonymised sale cards.

To exchange a temporary eBay OAuth `code=` URL for a refresh token locally, run:

```bash
python3 tools/exchange-ebay-code.py
```

The helper prompts for the Production App ID, Production Cert ID, RuName and full OAuth redirect URL. It prints the refresh token but does not save secrets.

## eBay Testimonials

The homepage feedback section reads from `data/testimonials.json`. A separate GitHub Action can update that file from eBay's Feedback API and only publishes privacy-safe testimonials:

- positive seller feedback only
- rating badges for positive, neutral or negative feedback types if they are ever included
- public eBay feedback images when eBay provides them
- no buyer usernames
- no user IDs
- no feedback IDs
- no listing IDs
- no order line item IDs
- no transaction IDs
- no prices
- no private account data

Add this optional repository secret if the existing order token was not consented with feedback access:

- `EBAY_FEEDBACK_REFRESH_TOKEN`

If this secret is not set, the testimonials workflow falls back to `EBAY_REFRESH_TOKEN`. The refresh token used by the testimonials workflow must be consented with:

```text
https://api.ebay.com/oauth/api_scope/commerce.feedback
```

The workflow can be run manually from GitHub Actions and also runs every six hours. If the workflow fails with an OAuth permission error, generate a fresh Production user token with the feedback scope and save it as `EBAY_FEEDBACK_REFRESH_TOKEN`.

The live workflow intentionally requests `EBAY_FEEDBACK_COMMENT_TYPES=POSITIVE` so the homepage stays trust-focused. The front end can display neutral or negative badges if those feedback types are ever enabled later.

To import an eBay orders report CSV as an anonymised historical backfill, run:

```bash
python3 tools/import-ebay-orders-report.py /path/to/eBay-orders-report.csv
EBAY_ACTIVITY_SKIP_API=1 node tools/fetch-ebay-sales-feed.mjs
```

To import one or more Whatnot earnings CSVs as anonymised historical backfill, run:

```bash
python3 tools/import-whatnot-earnings.py /path/to/*_earnings.csv
EBAY_ACTIVITY_SKIP_API=1 node tools/fetch-ebay-sales-feed.mjs
```

Only item titles, quantities, sale timestamps and marketplace source labels are written to `data/sales-backfill.json`; buyer, address, seller, order, shipment, price, fee, payment and tracking fields are discarded. The hourly workflow merges this backfill with new API orders.

## Project Structure

```text
/
├── index.html
├── sell-pokemon-cards.html
├── support.html
├── privacy.html
├── 404.html
├── data/sales-feed.json
├── data/sales-backfill.json
├── data/testimonials.json
├── styles/main.css
├── scripts/main.js
├── tools/fetch-ebay-sales-feed.mjs
├── tools/fetch-ebay-feedback-feed.mjs
├── tools/exchange-ebay-code.py
├── tools/import-ebay-orders-report.py
├── .github/workflows/ebay-sales-feed.yml
├── .github/workflows/ebay-feedback-feed.yml
├── assets/images/
├── assets/icons/
├── assets/branding/
├── CNAME
├── robots.txt
├── sitemap.xml
└── README.md
```

## Local Development

The site is static and can be opened directly in a browser. To serve it locally:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

## GitHub Pages Deployment

1. Push this repository to GitHub.
2. In the GitHub repository, open `Settings -> Pages`.
3. Select the publishing branch and root folder.
4. Set the custom domain to `vaulture.com.au`.
5. Enable `Enforce HTTPS` once DNS is correctly configured and GitHub Pages has issued the certificate.

The `CNAME` file is already set to:

```text
vaulture.com.au
```

## DNS Notes

DNS will likely be managed in Cloudflare. Configure GitHub Pages DNS records externally in Cloudflare. Support for `www.vaulture.com.au` should also be handled through DNS.

Do not commit Cloudflare API tokens, email credentials, passwords or DNS secrets to this repository.

## Email Routing

Cloudflare Email Routing can forward inbound aliases such as:

```text
hello@vaulture.com.au
sell@vaulture.com.au
orders@vaulture.com.au
support@vaulture.com.au
```

The website currently publishes `hello@vaulture.com.au`, `sell@vaulture.com.au` and `support@vaulture.com.au`.

## Form Setup

The collection enquiry form currently posts to:

```text
https://formspree.io/f/meeyyknp
```

The form includes a honeypot field named `_gotcha` for basic spam mitigation.

Photo uploads are intentionally not implemented in version 1 because GitHub Pages cannot process uploaded files by itself. Sellers can paste a share link to photos or inventory instead.

## SEO Workflow

The dedicated seller landing page is:

```text
https://vaulture.com.au/sell-pokemon-cards.html
```

After pushing changes:

1. Submit `https://vaulture.com.au/sitemap.xml` in Google Search Console.
2. Use URL Inspection for `https://vaulture.com.au/` and `https://vaulture.com.au/sell-pokemon-cards.html`.
3. Request indexing for both URLs.
4. Add `https://vaulture.com.au/` to Vaulture's Whatnot, eBay and social profiles.
5. Where possible, link directly to the sell page when discussing collection buying:

```text
https://vaulture.com.au/sell-pokemon-cards.html
```

## Future Collection Acquisition System

The current static form is structured so the selling funnel can later evolve into:

```text
Sell Your Collection
        ↓
Seller details
        ↓
Collection category
        ↓
Collection information
        ↓
Direct photo uploads
        ↓
Submission
        ↓
Vaulture reference ID
        ↓
Internal acquisition pipeline
```

Potential future statuses:

```text
New
Assessing
Need More Information
Offer Ready
Offer Sent
Accepted
Declined
Completed
```

Do not add backend credentials or upload handling until the site has a proper server-side system or managed form/file service.

## Brand And Intellectual Property

Vaulture is an independent business and is not affiliated with, endorsed by, or sponsored by Nintendo, The Pokémon Company, or Game Freak. Pokémon and related names and trademarks belong to their respective owners.

The hero imagery and local branding assets are intended to avoid copyrighted Pokémon artwork, characters, card names and official logos.
