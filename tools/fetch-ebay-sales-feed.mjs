import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = process.env.EBAY_ACTIVITY_OUTPUT || "data/sales-feed.json";
const MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || "EBAY_AU";
const DAYS_BACK = Number.parseInt(process.env.EBAY_DAYS_BACK || "90", 10);
const PAGE_LIMIT = Math.min(Number.parseInt(process.env.EBAY_PAGE_LIMIT || "50", 10), 100);
const MAX_PAGES = Math.max(Number.parseInt(process.env.EBAY_MAX_PAGES || "6", 10), 1);
const RECENT_LIMIT = Math.max(Number.parseInt(process.env.EBAY_RECENT_LIMIT || "12", 10), 1);
const SCOPE = process.env.EBAY_OAUTH_SCOPE || "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const ORDERS_URL = "https://api.ebay.com/sell/fulfillment/v1/order";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekKey(date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function clampTitle(title) {
  const cleaned = String(title || "")
    .replace(/\s+/g, " ")
    .replace(/\b(order|invoice|tracking|reference)\s*#?:?\s*\S+/gi, "")
    .trim();

  if (!cleaned) return "a Vaulture eBay item";
  if (cleaned.length <= 92) return cleaned;
  return `${cleaned.slice(0, 89).trim()}...`;
}

function anonymisedId(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 14);
}

function isVisibleSale(order) {
  const cancelState = String(order.cancelStatus?.cancelState || "").toUpperCase();
  const paymentStatus = String(order.orderPaymentStatus || "").toUpperCase();

  if (cancelState && !["NONE_REQUESTED", "NOT_REQUESTED"].includes(cancelState)) return false;
  if (paymentStatus.includes("PENDING") || paymentStatus.includes("FAILED")) return false;
  return true;
}

function lineItemQuantity(lineItem) {
  const quantity = Number(lineItem.quantity || 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function normaliseOrders(orders) {
  const visibleOrders = orders
    .filter(isVisibleSale)
    .sort((a, b) => new Date(b.creationDate || b.createdAt || 0) - new Date(a.creationDate || a.createdAt || 0));

  const recent = [];
  const dayMap = new Map();
  const weekMap = new Map();
  const now = new Date();
  const last7Cutoff = new Date(now.getTime() - 7 * 86400000);
  const last30Cutoff = new Date(now.getTime() - 30 * 86400000);
  let totalItems = 0;
  let last7Days = 0;
  let last30Days = 0;

  for (const order of visibleOrders) {
    const soldAt = new Date(order.creationDate || order.createdAt || order.updatedAt || Date.now());
    const dateKey = toIsoDate(soldAt);
    const weekKey = getWeekKey(soldAt);
    const lineItems = Array.isArray(order.lineItems) && order.lineItems.length > 0 ? order.lineItems : [{}];
    const orderItems = lineItems.reduce((total, lineItem) => total + lineItemQuantity(lineItem), 0);

    totalItems += orderItems;
    if (soldAt >= last7Cutoff) last7Days += 1;
    if (soldAt >= last30Cutoff) last30Days += 1;

    const dayEntry = dayMap.get(dateKey) || { date: dateKey, orders: 0, items: 0 };
    dayEntry.orders += 1;
    dayEntry.items += orderItems;
    dayMap.set(dateKey, dayEntry);

    const weekEntry = weekMap.get(weekKey) || { week: weekKey, orders: 0, items: 0 };
    weekEntry.orders += 1;
    weekEntry.items += orderItems;
    weekMap.set(weekKey, weekEntry);

    for (const lineItem of lineItems) {
      if (recent.length >= RECENT_LIMIT) break;

      const quantity = lineItemQuantity(lineItem);
      recent.push({
        id: anonymisedId([order.orderId, lineItem.lineItemId, lineItem.legacyItemId, soldAt.toISOString()]),
        source: "eBay",
        title: clampTitle(lineItem.title),
        quantity,
        soldAt: soldAt.toISOString()
      });
    }
  }

  return {
    updatedAt: now.toISOString(),
    source: "ebay",
    status: "live",
    privacy: "Buyer names, addresses, usernames, order IDs, prices and private order notes are never published in this feed.",
    summary: {
      totalOrders: visibleOrders.length,
      totalItems,
      last7Days,
      last30Days
    },
    recent,
    daily: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    weekly: Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week)).slice(-12)
  };
}

async function refreshAccessToken() {
  const clientId = requireEnv("EBAY_CLIENT_ID");
  const clientSecret = requireEnv("EBAY_CLIENT_SECRET");
  const refreshToken = requireEnv("EBAY_REFRESH_TOKEN");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPE
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    throw new Error(`Unable to refresh eBay access token: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.access_token;
}

async function fetchOrders(accessToken) {
  const orders = [];
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - DAYS_BACK * 86400000);
  const filter = `creationdate:[${startDate.toISOString()}..${endDate.toISOString()}]`;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(ORDERS_URL);
    url.searchParams.set("filter", filter);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(page * PAGE_LIMIT));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Unable to fetch eBay orders: ${response.status} ${JSON.stringify(payload)}`);
    }

    const pageOrders = Array.isArray(payload.orders) ? payload.orders : [];
    orders.push(...pageOrders);

    const total = Number(payload.total);
    if (pageOrders.length < PAGE_LIMIT || (Number.isFinite(total) && total > 0 && orders.length >= total)) break;
  }

  return orders;
}

async function loadFixtureOrders() {
  const fixturePath = process.env.EBAY_ACTIVITY_FIXTURE;
  if (!fixturePath) return null;

  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  return Array.isArray(fixture.orders) ? fixture.orders : fixture;
}

async function writeFeed(feed) {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(feed, null, 2)}\n`);
}

async function main() {
  const fixtureOrders = await loadFixtureOrders();
  const orders = fixtureOrders || await fetchOrders(await refreshAccessToken());
  await writeFeed(normaliseOrders(orders));
  console.log(`Wrote anonymised eBay sales feed to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
