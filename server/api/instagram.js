import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_USERNAME = "example";
const MAX_LIMIT = 4;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

let cachedFeed = null;
let cachedAt = 0;

export function normalizeInstagramPost(node = {}, username = DEFAULT_USERNAME) {
  const caption =
    node.edge_media_to_caption?.edges?.[0]?.node?.text ||
    (typeof node.caption === "string" ? node.caption : node.caption?.text) ||
    "";
  const shortcode = node.shortcode || node.code || "";
  const image = node.display_url || node.thumbnail_src || node.media_url || "";

  return {
    id: node.id || shortcode,
    media_type: node.is_video ? "VIDEO" : "IMAGE",
    media_url: image,
    source_media_url: image,
    permalink: shortcode ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/${username}/`,
    caption,
    title: firstLine(caption) || "Instagram Upload",
    timestamp: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : node.timestamp || ""
  };
}

export function normalizeInstagramFeed(payload = {}, username = DEFAULT_USERNAME, limit = MAX_LIMIT) {
  const user = payload?.data?.user || payload?.user || {};
  const edges = user?.edge_owner_to_timeline_media?.edges || payload?.posts || [];
  const posts = edges
    .map((edge) => normalizeInstagramPost(edge.node || edge, user.username || username))
    .slice(0, limit);

  return {
    source: "instagram-public-profile",
    profile: {
      username: user.username || username,
      permalink: `https://www.instagram.com/${user.username || username}/`,
      profile_picture_url: user.profile_pic_url || "",
      media_count: user.all_media_count || posts.length
    },
    posts
  };
}

export async function fetchInstagramFeed(options = {}) {
  const username = cleanUsername(options.username);
  const limit = limitPosts(options.limit);
  const cacheKey = `${username}:${limit}`;

  if (!options.noCache && cachedFeed?.cacheKey === cacheKey && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedFeed.feed;
  }

  const payload = options.payload || await fetchInstagramPayload(username, options.fetchImpl || fetch);
  const feed = normalizeInstagramFeed(payload, username, limit);

  if (!feed.posts.length) {
    throw new Error("Instagram profile has no public posts");
  }

  if (options.inlineImages !== false) {
    feed.posts = await Promise.all(feed.posts.map(async (post) => ({
      ...post,
      media_url: await imageAsDataUrl(post.media_url, options.fetchImpl || fetch)
    })));
  }

  cachedFeed = { cacheKey, feed };
  cachedAt = Date.now();
  return feed;
}

export async function handleInstagramRequest(req, res) {
  try {
    const feed = await fetchInstagramFeed({
      username: req.query.username,
      limit: req.query.limit
    });
    res.set("Cache-Control", "public, max-age=300, s-maxage=600");
    return res.status(200).json(feed);
  } catch (error) {
    return res.status(502).json({
      source: "instagram-public-profile",
      profile: {
        username: cleanUsername(req.query.username),
        permalink: `https://www.instagram.com/${cleanUsername(req.query.username)}/`
      },
      posts: [],
      error: error.message
    });
  }
}

function cleanUsername(value = "") {
  const username = String(value || DEFAULT_USERNAME).replace(/^@/, "").trim();
  return /^[a-zA-Z0-9._]{1,30}$/.test(username) ? username : DEFAULT_USERNAME;
}

function limitPosts(value) {
  const limit = Number(value || MAX_LIMIT);
  if (!Number.isFinite(limit)) return MAX_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function firstLine(value = "") {
  return String(value).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

async function fetchInstagramPayload(username) {
  const python = process.env.INSTAGRAM_PYTHON || "python3";

  const { stdout } = await execFileAsync(
    python,
    ["scripts/instagram-fetch.py", username],
    {
      timeout: 35000,
      maxBuffer: 2 * 1024 * 1024
    }
  );

  return JSON.parse(stdout);
}

async function imageAsDataUrl(url, fetchImpl) {
  if (!url || url.startsWith("data:") || !isTrustedInstagramImageUrl(url)) return url;

  try {
    const response = await fetchWithTimeout(fetchImpl, url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) return url;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!/^image\/(avif|gif|jpe?g|png|webp)$/i.test(contentType)) return url;
    if (Number(response.headers.get("content-length") || 0) > MAX_IMAGE_BYTES) return url;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return url;
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    return url;
  }
}

export function isTrustedInstagramImageUrl(value = "") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "instagram.com"
      || url.hostname.endsWith(".instagram.com")
      || url.hostname.endsWith(".cdninstagram.com")
      || url.hostname.endsWith(".fbcdn.net")
    );
  } catch {
    return false;
  }
}

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
