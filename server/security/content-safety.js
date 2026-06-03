import sanitizeHtml from "sanitize-html";

const EMBED_HOSTS = new Set([
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "www.google.com",
  "www.paypal.com",
  "tickets.clevertix.de",
  "www.instagram.com",
  "open.spotify.com",
  "w.soundcloud.com",
  "bandcamp.com",
  "challonge.com"
]);
const RICH_FIELDS = new Set(["introHtml", "privacyNote", "thanksText"]);

export function sanitizeConfiguredContent(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => sanitizeConfiguredContent(item, key));
  if (!value || typeof value !== "object") {
    return typeof value === "string" && RICH_FIELDS.has(key) ? sanitizeRichHtml(value) : value;
  }
  if (value.type === "html" && typeof value.value === "string") {
    return { ...value, value: sanitizeRichHtml(value.value) };
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, sanitizeConfiguredContent(child, childKey)])
  );
}

export function sanitizeRichHtml(value = "") {
  return sanitizeHtml(String(value), {
    allowedTags: ["a", "address", "br", "div", "em", "h3", "iframe", "img", "li", "p", "span", "strong", "ul"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      div: ["class"],
      iframe: ["src", "title", "loading", "scrolling"],
      img: ["src", "alt", "width", "height", "loading"],
      span: ["class"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          href: safeUrl(attribs.href, { mailto: true }),
          ...(attribs.target === "_blank" ? { target: "_blank", rel: "noopener noreferrer" } : {})
        }
      }),
      iframe: (tagName, attribs) => ({
        tagName,
        attribs: {
          src: safeIframeUrl(attribs.src),
          title: attribs.title || "Embedded content",
          loading: "lazy",
          ...(attribs.scrolling === "no" ? { scrolling: "no" } : {})
        }
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          src: safeRichAssetUrl(attribs.src),
          alt: attribs.alt || "",
          ...(attribs.width ? { width: attribs.width } : {}),
          ...(attribs.height ? { height: attribs.height } : {}),
          loading: "lazy"
        }
      })
    }
  });
}

function safeRichAssetUrl(value = "") {
  const url = safeUrl(value);
  return !url || url.includes("\\") || url.includes("\0") ? "" : url;
}

export function safeUrl(value = "", options = {}) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("#") || /^(\.?\.?\/)?[a-zA-Z0-9][a-zA-Z0-9./?=&_%+-]*$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (["https:", "http:"].includes(parsed.protocol)) return parsed.href;
    if (options.mailto && parsed.protocol === "mailto:") return url;
  } catch {
    return "";
  }
  return "";
}

export function safeAssetUrl(value = "") {
  const url = safeUrl(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return url.includes("..") || url.includes("\\") ? "" : url;
}

export function safeIframeUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && EMBED_HOSTS.has(url.hostname) ? url.href : "";
  } catch {
    return "";
  }
}
