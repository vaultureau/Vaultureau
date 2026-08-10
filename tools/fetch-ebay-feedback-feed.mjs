import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = process.env.EBAY_FEEDBACK_OUTPUT || "data/testimonials.json";
const MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || "EBAY_AU";
const USER_ID = process.env.EBAY_FEEDBACK_USER_ID || "vaultureau";
const PAGE_LIMIT = Math.min(Number.parseInt(process.env.EBAY_FEEDBACK_PAGE_LIMIT || "25", 10), 200);
const MAX_PAGES = Math.max(Number.parseInt(process.env.EBAY_FEEDBACK_MAX_PAGES || "4", 10), 1);
const TESTIMONIAL_LIMIT = Math.max(Number.parseInt(process.env.EBAY_TESTIMONIAL_LIMIT || "12", 10), 1);
const SCOPE = process.env.EBAY_FEEDBACK_SCOPE || "https://api.ebay.com/oauth/api_scope/commerce.feedback";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const FEEDBACK_URL = "https://api.ebay.com/commerce/feedback/v1/feedback";

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

function anonymisedId(parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 14);
}

function stripPrivateText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "")
    .replace(/\b(?:email|e-mail|phone|mobile|call|text)\s*:?\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampComment(comment) {
  const cleaned = stripPrivateText(comment);

  if (!cleaned) return "";
  if (cleaned.length <= 190) return cleaned;
  return `${cleaned.slice(0, 187).trim()}...`;
}

function getComment(feedback) {
  const comment = feedback.feedbackComment;

  if (typeof comment === "string") return comment;

  return firstString(
    comment?.commentText,
    comment?.text,
    comment?.value,
    feedback.commentText,
    feedback.comment,
    feedback.feedbackCommentText
  );
}

function getFeedbackDate(feedback) {
  return firstString(
    feedback.feedbackEnteredDate,
    feedback.creationDate,
    feedback.createdDate,
    feedback.lastModifiedDate
  );
}

function getCommentType(feedback) {
  return firstString(
    feedback.commentType,
    feedback.feedbackComment?.commentType,
    feedback.ratingType,
    feedback.type
  ).toUpperCase();
}

function getFeedbackScore(feedback) {
  const score = Number(feedback.feedbackScore || feedback.recipientFeedbackScore);
  return Number.isFinite(score) ? score : null;
}

function getFeedbackArray(payload) {
  const candidates = [
    payload.feedback,
    payload.feedbacks,
    payload.feedbackDetails,
    payload.feedbackDetail,
    payload.feedbackEntries,
    payload.items,
    payload.feedbackDetailArray?.feedbackDetail,
    payload.feedbackDetailArray?.feedbackDetails
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function getPayloadTotal(payload, fallback) {
  const total = Number(payload.total || payload.totalRecords || payload.totalEntries || payload.pagination?.total);
  return Number.isFinite(total) ? total : fallback;
}

function normaliseFeedbackItems(items, payloadTotal) {
  const testimonials = [];
  const seen = new Set();
  let feedbackScore = null;

  for (const feedback of items) {
    const commentType = getCommentType(feedback);

    if (commentType && commentType !== "POSITIVE") continue;
    if (feedback.automatedFeedback === true) continue;

    const comment = clampComment(getComment(feedback));
    if (!comment || comment.length < 12) continue;

    const enteredAt = getFeedbackDate(feedback);
    const score = getFeedbackScore(feedback);
    const dedupeKey = comment.toLowerCase().replace(/\s+/g, " ");

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    if (score !== null) feedbackScore = Math.max(feedbackScore || 0, score);

    testimonials.push({
      id: anonymisedId([feedback.feedbackId, enteredAt, dedupeKey]),
      source: "eBay",
      label: "Verified eBay buyer",
      comment,
      commentType: "positive"
    });

    if (testimonials.length >= TESTIMONIAL_LIMIT) break;
  }

  return {
    updatedAt: new Date().toISOString(),
    source: "eBay Feedback API",
    status: testimonials.length > 0 ? "live" : "empty",
    privacy: "Only positive public seller feedback comments are published. Buyer usernames, user IDs, feedback IDs, listing IDs, order line item IDs, transaction IDs, prices and private account data are removed.",
    summary: {
      totalSynced: testimonials.length,
      positiveSynced: testimonials.length,
      availableFeedback: payloadTotal || testimonials.length,
      feedbackScore
    },
    testimonials
  };
}

async function refreshAccessToken() {
  const clientId = requireEnv("EBAY_CLIENT_ID");
  const clientSecret = requireEnv("EBAY_CLIENT_SECRET");
  const refreshToken = process.env.EBAY_FEEDBACK_REFRESH_TOKEN || requireEnv("EBAY_REFRESH_TOKEN");
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
    throw new Error(`Unable to refresh eBay feedback access token: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload.access_token;
}

async function fetchFeedback(accessToken) {
  const feedbackItems = [];
  let payloadTotal = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(FEEDBACK_URL);
    url.searchParams.set("user_id", USER_ID);
    url.searchParams.set("feedback_type", "FEEDBACK_RECEIVED");
    url.searchParams.set("filter", "commentType:POSITIVE,role:SELLER,includeAutomatedFeedback:false");
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(page * PAGE_LIMIT));
    url.searchParams.set("sort", "TIME");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE_ID
      }
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(`Unable to fetch eBay feedback: ${response.status} ${JSON.stringify(payload)}`);
    }

    const pageItems = getFeedbackArray(payload);
    feedbackItems.push(...pageItems);
    payloadTotal = Math.max(payloadTotal, getPayloadTotal(payload, feedbackItems.length));

    if (pageItems.length < PAGE_LIMIT || feedbackItems.length >= TESTIMONIAL_LIMIT) break;
  }

  return { feedbackItems, payloadTotal };
}

async function loadFixtureFeedback() {
  const fixturePath = process.env.EBAY_FEEDBACK_FIXTURE;
  if (!fixturePath) return null;

  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const feedbackItems = Array.isArray(fixture) ? fixture : getFeedbackArray(fixture);
  return {
    feedbackItems,
    payloadTotal: getPayloadTotal(fixture, feedbackItems.length)
  };
}

async function writeFeed(feed) {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(feed, null, 2)}\n`);
}

async function main() {
  const { feedbackItems, payloadTotal } = await loadFixtureFeedback() || await fetchFeedback(await refreshAccessToken());
  const feed = normaliseFeedbackItems(feedbackItems, payloadTotal);

  await writeFeed(feed);
  console.log(`Wrote anonymised eBay testimonials feed to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
