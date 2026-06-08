const DEFAULT_USERNAME = "example";
const MAX_LIMIT = 4;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'self'; script-src 'self' https://js.hcaptcha.com https://www.instagram.com https://tickets.clevertix.de https://*.hcaptcha.com; style-src 'self' 'unsafe-inline' https://tickets.clevertix.de; img-src 'self' data: https:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com https://www.paypal.com https://tickets.clevertix.de https://www.instagram.com https://open.spotify.com https://w.soundcloud.com https://bandcamp.com https://challonge.com https://*.hcaptcha.com; connect-src 'self' https://hcaptcha.com https://*.hcaptcha.com; font-src 'self' data:",
  "Permissions-Policy": 'camera=(), microphone=(), geolocation=(), payment=(), encrypted-media=(self "https://www.youtube.com" "https://www.youtube-nocookie.com" "https://open.spotify.com" "https://w.soundcloud.com" "https://bandcamp.com")',
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN"
};

let cachedFeed = null;
let cachedAt = 0;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": statusCode === 200 ? "public, max-age=300, s-maxage=600" : "no-store"
    },
    body: JSON.stringify(body)
  };
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

function firstCaption(node = {}) {
  return node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
}

function firstLine(value = "") {
  return String(value).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

async function imageAsDataUrl(url) {
  if (!url || !isTrustedInstagramImageUrl(url)) return url || "";

  try {
    const response = await fetchWithTimeout(url, {
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

async function fetchInstagramProfile(username, limit) {
  const endpoint = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": `https://www.instagram.com/${username}/`,
      "x-asbd-id": "129477",
      "x-ig-app-id": "936619743392459",
      "x-requested-with": "XMLHttpRequest"
    }
  });

  if (!response.ok) {
    throw new Error(`Instagram responded with ${response.status}`);
  }

  const payload = await response.json();
  const user = payload?.data?.user;
  const edges = user?.edge_owner_to_timeline_media?.edges || [];

  if (!user || !edges.length) {
    throw new Error("Instagram profile has no public posts");
  }

  const posts = await Promise.all(edges.slice(0, limit).map(async ({ node }) => {
    const caption = firstCaption(node);
    const image = node.display_url || node.thumbnail_src || "";

    return {
      id: node.id || node.shortcode,
      media_type: node.is_video ? "VIDEO" : "IMAGE",
      media_url: await imageAsDataUrl(image),
      source_media_url: image,
      permalink: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : `https://www.instagram.com/${username}/`,
      caption,
      title: firstLine(caption) || "Instagram Upload",
      timestamp: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : ""
    };
  }));

  return {
    source: "instagram-public-profile",
    profile: {
      username: user.username || username,
      permalink: `https://www.instagram.com/${user.username || username}/`,
      profile_picture_url: user.profile_pic_url || "",
      media_count: user.edge_owner_to_timeline_media?.count || posts.length
    },
    posts
  };
}

exports.handler = async (event) => {
  const username = cleanUsername(event.queryStringParameters?.username);
  const limit = limitPosts(event.queryStringParameters?.limit);
  const cacheKey = `${username}:${limit}`;

  if (cachedFeed?.cacheKey === cacheKey && Date.now() - cachedAt < CACHE_TTL_MS) {
    return json(200, cachedFeed.feed);
  }

  try {
    const feed = await fetchInstagramProfile(username, limit);
    cachedFeed = { cacheKey, feed };
    cachedAt = Date.now();
    return json(200, feed);
  } catch (error) {
    return json(502, {
      source: "instagram-public-profile",
      profile: { username, permalink: `https://www.instagram.com/${username}/` },
      posts: [],
      error: error.message
    });
  }
};

function isTrustedInstagramImageUrl(value = "") {
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

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
