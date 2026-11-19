import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FETCH_SCRIPT = path.resolve(__dirname, "../../scripts/instagram-fetch.py");

const DEFAULT_USERNAME = "example";
const USERNAME_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;
const MAX_LIMIT = 4;
const SUCCESS_TTL_MS = 10 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const SCRIPT_TIMEOUT_MS = 35000;
const SCRIPT_MAX_BUFFER = 2 * 1024 * 1024;

export const INSTAGRAM_PUBLIC_ERROR = "Instagram feed is currently unavailable.";

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

/**
 * Picks the Instagram account the server is allowed to fetch. Visitors never choose it.
 * @param {{ env?: Record<string, string | undefined>, configs?: object[] }} sources
 * @returns {string}
 */
export function resolveInstagramUsername({ env = process.env, configs = [] } = {}) {
  const candidates = [env.INSTAGRAM_USERNAME, ...configs.map((config) => config?.instagram?.username)];
  for (const candidate of candidates) {
    const username = String(candidate || "").replace(/^@/, "").trim();
    if (USERNAME_PATTERN.test(username)) return username;
  }
  return DEFAULT_USERNAME;
}

/**
 * Fetches one fixed Instagram profile with success/failure caching and a shared in-flight request,
 * so public traffic can never start more than one fetch per TTL window.
 */
export function createInstagramFeedService(options = {}) {
  const username = resolveInstagramUsername({ env: {}, configs: [{ instagram: { username: options.username } }] });
  const loadPayload = options.loadPayload || fetchInstagramPayload;
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const successTtlMs = Number(options.successTtlMs ?? SUCCESS_TTL_MS);
  const failureTtlMs = Number(options.failureTtlMs ?? FAILURE_TTL_MS);
  const inlineImages = options.inlineImages !== false;

  let cache = null;
  let inFlight = null;

  async function load() {
    const payload = await loadPayload(username);
    const feed = normalizeInstagramFeed(payload, username, MAX_LIMIT);
    if (!feed.posts.length) throw new Error("Instagram profile has no public posts");
    if (!inlineImages) return feed;
    const posts = await Promise.all(feed.posts.map(async (post) => ({
      ...post,
      media_url: await imageAsDataUrl(post.media_url, fetchImpl)
    })));
    return { ...feed, posts };
  }

  function refresh() {
    inFlight = load()
      .then((feed) => {
        cache = { feed, error: null, expiresAt: now() + successTtlMs };
        return feed;
      })
      .catch((error) => {
        cache = { feed: null, error, expiresAt: now() + failureTtlMs };
        options.onRefreshError?.(error);
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function currentFeed() {
    if (cache && cache.expiresAt > now()) {
      if (cache.error) throw cache.error;
      return cache.feed;
    }
    return inFlight || refresh();
  }

  async function getFeed(limit) {
    const feed = await currentFeed();
    return { ...feed, posts: feed.posts.slice(0, limitPosts(limit)) };
  }

  return { username, getFeed };
}

/**
 * Express handler. Only `limit` is read from the query; internal errors stay in the server log.
 */
export function createInstagramHandler(service, options = {}) {
  return async function instagramHandler(req, res) {
    try {
      const feed = await service.getFeed(req.query?.limit);
      res.set("Cache-Control", "public, max-age=300, s-maxage=600");
      return res.status(200).json(feed);
    } catch (error) {
      options.onError?.(error, req);
      res.set("Cache-Control", "no-store");
      return res.status(502).json({
        source: "instagram-public-profile",
        profile: {
          username: service.username,
          permalink: `https://www.instagram.com/${service.username}/`
        },
        posts: [],
        error: INSTAGRAM_PUBLIC_ERROR
      });
    }
  };
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
  const { stdout } = await execFileAsync(python, [FETCH_SCRIPT, username], {
    timeout: SCRIPT_TIMEOUT_MS,
    maxBuffer: SCRIPT_MAX_BUFFER
  });
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
  } catch {
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
