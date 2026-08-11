import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = process.env.EBAY_LISTINGS_OUTPUT || "data/listings-feed.json";
const MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || "EBAY_AU";
const SELLER_USERNAME = process.env.EBAY_SELLER_USERNAME || "vaultureau";
const SEARCH_QUERY = process.env.EBAY_LISTINGS_QUERY || "Pokemon";
const SEARCH_LIMIT = Math.min(Math.max(Number.parseInt(process.env.EBAY_LISTINGS_LIMIT || "12", 10), 1), 50);
const PUBLIC_LIMIT = Math.min(Math.max(Number.parseInt(process.env.EBAY_LISTINGS_PUBLIC_LIMIT || "8", 10), 1), 12);
const SCOPE = process.env.EBAY_BROWSE_SCOPE || "https://api.ebay.com/oauth/api_scope";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function upgradeEbayImageUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const isEbayImage = /(^|\.)ebayimg\.com$/i.test(url.hostname);

    if (isEbayImage) {
      url.pathname = url.pathname.replace(/\/s-l\d+(?=\.|\/)/gi, "/s-l1600");
    }

    return url.toString();
  } catch {
    return imageUrl;
  }
}

function normaliseImageUrl(value) {
  const imageUrl = typeof value === "string"
    ? value
    : firstString(value?.imageUrl, value?.url, value?.src);

  if (!imageUrl) return "";

  try {
    const url = new URL(imageUrl);
    return ["http:", "https:"].includes(url.protocol) ? upgradeEbayImageUrl(url.toString()) : "";
  } catch {
    return "";
  }
}

function normalisePrice(price) {
  const value = Number(price?.value);
  const currency = firstString(price?.currency, price?.currencyId);

  if (!Number.isFinite(value) || value <= 0) return null;

  return {
    value,
    currency: currency || "AUD",
  };
}

function clampTitle(title) {
  const cleaned = String(title || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Vaulture eBay listing";
  if (cleaned.length <= 110) return cleaned;
  return `${cleaned.slice(0, 107).trim()}...`;
}

function getListingImage(item) {
  return normaliseImageUrl(
    item.image,
    Array.isArray(item.thumbnailImages) ? item.thumbnailImages[0] : null,
    Array.isArray(item.additionalImages) ? item.additionalImages[0] : null
  );
}

function getListingUrl(item) {
  return firstString(item.itemWebUrl, item.itemAffiliateWebUrl, item.webUrl);
}

function getBuyingLabel(options) {
  const values = Array.isArray(options) ? options : [];

  if (values.includes("AUCTION")) return "Auction";
  if (values.includes("BEST_OFFER")) return "Best offer";
  if (values.includes("FIXED_PRICE")) return "Buy it now";
  return "eBay listing";
}

function normaliseListings(items) {
  const seen = new Set();
  const listings = [];

  for (const item of items) {
    const id = firstString(item.itemId, item.legacyItemId);
    const url = getListingUrl(item);

    if (!id || !url || seen.has(id)) continue;
    seen.add(id);

    listings.push({
      id,
      source: "eBay",
      title: clampTitle(item.title),
      url,
      image: getListingImage(item),
      price: normalisePrice(item.price || item.currentBidPrice),
      condition: firstString(item.condition, item.localizedAspects?.condition),
      buyingOption: getBuyingLabel(item.buyingOptions),
    });

    if (listings.length >= PUBLIC_LIMIT) break;
  }

  return listings;
}

async function getApplicationAccessToken() {
  const clientId = requireEnv("EBAY_CLIENT_ID");
  const clientSecret = requireEnv("EBAY_CLIENT_SECRET");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: SCOPE,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    throw new Error(`Unable to create eBay Browse access token: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.access_token;
}

async function fetchSellerListings(accessToken) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", SEARCH_QUERY);
  url.searchParams.set("filter", `sellers:{${SELLER_USERNAME}}`);
  url.searchParams.set("limit", String(SEARCH_LIMIT));

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID,
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Unable to fetch eBay listings: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

function buildFeed(payload) {
  const itemSummaries = Array.isArray(payload.itemSummaries) ? payload.itemSummaries : [];
  const listings = normaliseListings(itemSummaries);

  return {
    updatedAt: new Date().toISOString(),
    source: "eBay Browse API",
    status: listings.length > 0 ? "live" : "empty",
    marketplace: MARKETPLACE_ID,
    seller: SELLER_USERNAME,
    privacy: "Only public eBay listing details are published. No buyer data, order data, private seller data or API tokens are included.",
    summary: {
      totalMatched: Number.isFinite(Number(payload.total)) ? Number(payload.total) : listings.length,
      totalSynced: listings.length,
    },
    listings,
  };
}

async function main() {
  const payload = await fetchSellerListings(await getApplicationAccessToken());
  const feed = buildFeed(payload);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(feed, null, 2)}\n`);
  console.log(`Wrote public eBay listings feed to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
