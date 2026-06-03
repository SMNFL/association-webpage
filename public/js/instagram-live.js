import { escapeHtml, safeHref, safeImage } from "./security.js";

const LIVE_INSTAGRAM_ENDPOINTS = [
  "/api/instagram-feed",
  "/.netlify/functions/instagram-feed"
];

function imageForPost(post) {
  return post.media_type === "VIDEO"
    ? post.thumbnail_url || post.media_url
    : post.media_url || post.thumbnail_url;
}

function trimCaption(caption = "", maxLength = 130) {
  const text = caption.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function firstLine(value = "") {
  return String(value).split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load Instagram feed: ${response.status}`);
  return response.json();
}

function withInstagramParams(endpoint, instagram = {}) {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set("username", instagram.username || "example");
  url.searchParams.set("limit", instagram.postLimit || 4);
  return url.pathname + url.search;
}

function renderProfile(profile = {}, instagram = {}, renderedPostCount = 0) {
  const usernameNode = document.querySelector("[data-instagram-username]");
  const sourceNode = document.querySelector("[data-instagram-source]");
  const profileLinks = document.querySelectorAll("[data-instagram-link]");
  const username = profile.username || instagram.username || "example";
  const profileUrl = profile.permalink || instagram.profileUrl || `https://www.instagram.com/${username}/`;

  if (usernameNode) usernameNode.textContent = `@${username}`;
  if (sourceNode) {
    const count = Number.isFinite(Number(profile.media_count)) && Number(profile.media_count) > 0
      ? Number(profile.media_count)
      : renderedPostCount;
    sourceNode.textContent = count === 1 ? "1 post" : `${count} posts`;
  }
  profileLinks.forEach((link) => {
    link.href = safeHref(profileUrl) || "#";
  });
}

function renderPreviewGrid(container, posts = [], instagram = {}) {
  const visiblePosts = posts.slice(0, Number(instagram.postLimit || 4));
  if (!visiblePosts.length) return false;

  container.innerHTML = `
    <div class="instagram-official-grid instagram-preview-grid">
      ${visiblePosts.map((post) => {
        const image = safeImage(post.image || imageForPost(post));
        const permalink = safeHref(post.permalink || instagram.profileUrl || `https://www.instagram.com/${instagram.username || "example"}/`) || "#";
        const title = post.title || firstLine(post.caption) || "Instagram Upload";
        const caption = trimCaption(post.caption || title);

        return `
          <a class="instagram-preview-card" href="${escapeHtml(permalink)}" target="_blank" rel="noreferrer" aria-label="Open Instagram post: ${escapeHtml(title)}">
            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy">` : `<span class="instagram-post__empty">Instagram</span>`}
            <span class="instagram-preview-card__overlay">
              <strong>${escapeHtml(title)}</strong>
              <em>${escapeHtml(caption)}</em>
            </span>
          </a>
        `;
      }).join("")}
    </div>
  `;
  return true;
}

function renderPosts(container, feed, instagram) {
  const limit = Number(instagram.postLimit || 4);
  const posts = (feed.posts || []).slice(0, limit);
  const profile = feed.profile || {};

  if (!posts.length) {
    container.innerHTML = `
      <div class="instagram-placeholder">
        <p>The latest Instagram posts could not be loaded right now.</p>
        <a class="button button--ghost" href="${escapeHtml(safeHref(instagram.profileUrl || "https://www.instagram.com/example/") || "#")}" target="_blank" rel="noreferrer">Open profile</a>
      </div>
    `;
    return;
  }

  renderPreviewGrid(container, posts, { ...instagram, username: profile.username || instagram.username });
  renderProfile(profile, instagram, posts.length);
}

export async function renderInstagram(instagram = {}) {
  const usernameNode = document.querySelector("[data-instagram-username]");
  const profileLinks = document.querySelectorAll("[data-instagram-link]");
  const embed = document.querySelector("[data-instagram-embed]");
  const username = instagram.username || "example";

  if (usernameNode) usernameNode.textContent = `@${username}`;
  profileLinks.forEach((link) => {
    link.href = safeHref(instagram.profileUrl || `https://www.instagram.com/${username}/`) || "#";
  });

  if (!embed) return;

  embed.innerHTML = `<div class="instagram-placeholder"><p>Instagram Feed wird geladen...</p></div>`;

  const endpoints = [
    ...LIVE_INSTAGRAM_ENDPOINTS.map((endpoint) => withInstagramParams(endpoint, { ...instagram, username })),
    instagram.fallbackFeed || ""
  ].filter(Boolean);

  for (const endpoint of endpoints) {
    try {
      const feed = await fetchJson(endpoint);
      if (!feed.posts?.length) continue;
      renderPosts(embed, feed, { ...instagram, username });
      return;
    } catch (error) {
      console.warn(error);
    }
  }

  renderPosts(embed, { posts: [], profile: { username } }, instagram);
}
