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
```

## Project Structure

```text
/
├── index.html
├── sell-pokemon-cards.html
├── privacy.html
├── 404.html
├── styles/main.css
├── scripts/main.js
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

The website currently publishes only `hello@vaulture.com.au` and `sell@vaulture.com.au`.

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
