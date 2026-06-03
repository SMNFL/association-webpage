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

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeHref(value = "", options = {}) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("#") || /^(\.?\.?\/)?[a-zA-Z0-9][a-zA-Z0-9./?=&_%+-]*$/.test(url)) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (["https:", "http:"].includes(parsed.protocol)) return url;
    if (options.mailto && parsed.protocol === "mailto:") return url;
  } catch {
    return "";
  }
  return "";
}

export function safeAsset(value = "") {
  const url = safeHref(value);
  if (!url || url.includes("\\") || /^data:/i.test(url)) return "";
  return url;
}

export function safeImage(value = "") {
  const url = String(value || "").trim();
  if (/^data:image\/(png|jpeg|webp|gif);base64,[a-zA-Z0-9+/]+=*$/i.test(url)) return url;
  return safeAsset(url);
}

export function safeIframeSrc(value = "") {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && EMBED_HOSTS.has(url.hostname) ? url.href : "";
  } catch {
    return "";
  }
}

export function safeCssPosition(value = "center center") {
  const position = String(value || "").trim();
  return /^((left|center|right|top|bottom)|([0-9]{1,3}%))(\s+((left|center|right|top|bottom)|([0-9]{1,3}%)))?$/.test(position)
    ? position
    : "center center";
}

export function sanitizeRichHtml(value = "") {
  const template = document.createElement("template");
  template.innerHTML = String(value);
  sanitizeChildren(template.content);
  return template.innerHTML;
}

function sanitizeChildren(root) {
  const allowedTags = new Set(["A", "ADDRESS", "BR", "DIV", "EM", "H3", "IFRAME", "IMG", "LI", "P", "SPAN", "STRONG", "UL"]);
  [...root.children].forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      sanitizeChildren(node);
      node.replaceWith(...node.childNodes);
      return;
    }
    sanitizeAttributes(node);
    sanitizeChildren(node);
  });
}

function sanitizeAttributes(node) {
  const allowed = {
    A: new Set(["href", "target", "rel"]),
    DIV: new Set(["class"]),
    IFRAME: new Set(["src", "title", "loading", "scrolling"]),
    IMG: new Set(["src", "alt", "width", "height", "loading"]),
    SPAN: new Set(["class"])
  }[node.tagName] || new Set();
  [...node.attributes].forEach((attribute) => {
    if (!allowed.has(attribute.name)) node.removeAttribute(attribute.name);
  });
  if (node.tagName === "A") {
    node.setAttribute("href", safeHref(node.getAttribute("href"), { mailto: true }) || "#");
    if (node.target === "_blank") node.rel = "noopener noreferrer";
  }
  if (node.tagName === "IFRAME") {
    const src = safeIframeSrc(node.getAttribute("src"));
    if (!src) node.remove();
    else node.src = src;
  }
  if (node.tagName === "IMG") {
    const src = safeAsset(node.getAttribute("src"));
    if (!src) node.remove();
    else node.src = src;
  }
}
