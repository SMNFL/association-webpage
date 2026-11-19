import { safeAssetUrl } from "./security/content-safety.js";

const HOME_PATHS = new Set(["/", "/index.html"]);

/**
 * @param {string} value e.g. "https://example.org/"
 * @returns {string} origin-style base URL without trailing slash, or "" when unusable
 */
export function normalizeSiteUrl(value = "") {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Collects the metadata a crawler or link preview needs, without running client-side JavaScript.
 * Fields left empty are not written, so hand-written page titles stay untouched.
 */
export function buildPageMeta({ html = "", pathname = "/", site = {}, pages = {}, siteUrl = "" } = {}) {
  const page = pages?.[pageKeyFromHtml(html)];
  const isHome = HOME_PATHS.has(pathname);
  const title = isHome
    ? site.title || site.name || ""
    : page?.title ? [page.title, site.name].filter(Boolean).join(" | ") : "";
  const description = isHome ? site.description || "" : page?.description || "";
  const imagePath = localAssetPath(site.images?.socialPreview || site.images?.hero);

  return {
    lang: site.language || "",
    title,
    description,
    image: imagePath && siteUrl ? `${siteUrl}${imagePath}` : "",
    canonical: siteUrl ? `${siteUrl}${pathname === "/index.html" ? "/" : pathname}` : "",
    favicon: localAssetPath(site.images?.logo)
  };
}

export function applyPageMeta(html = "", meta = {}) {
  let output = html;
  // Replacements are functions so "$&", "$'" or "$$" in editor-written text stay literal.
  if (meta.lang) output = output.replace(/<html\b([^>]*)\blang="[^"]*"/i, (match, attrs) => `<html${attrs}lang="${escapeAttribute(meta.lang)}"`);
  if (meta.title) {
    output = output.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeText(meta.title)}</title>`);
    output = setMetaTag(output, "property", "og:title", meta.title);
  }
  if (meta.description) {
    output = setMetaTag(output, "name", "description", meta.description);
    output = setMetaTag(output, "property", "og:description", meta.description);
  }
  if (meta.image) output = setMetaTag(output, "property", "og:image", meta.image);
  if (meta.canonical && !/<link\s+rel="canonical"/i.test(output)) {
    output = insertIntoHead(output, `<link rel="canonical" href="${escapeAttribute(meta.canonical)}">`);
  }
  if (meta.favicon) output = setFavicon(output, meta.favicon);
  return output;
}

/**
 * @param {string} siteUrl
 * @param {{ path: string, lastmod?: Date }[]} entries
 */
export function buildSitemapXml(siteUrl, entries = []) {
  const urls = entries.map(({ path, lastmod }) => {
    const date = lastmod instanceof Date && !Number.isNaN(lastmod.getTime())
      ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>`
      : "";
    return `  <url><loc>${escapeText(`${siteUrl}${path}`)}</loc>${date}</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    ""
  ].join("\n");
}

export function buildRobotsTxt(siteUrl = "") {
  const lines = ["User-agent: *", "Allow: /"];
  if (siteUrl) lines.push("", `Sitemap: ${siteUrl}/sitemap.xml`);
  return `${lines.join("\n")}\n`;
}

function pageKeyFromHtml(html = "") {
  return html.match(/<body\b[^>]*\bdata-page="([^"]+)"/i)?.[1] || "";
}

/** Site-relative asset path ("/assets/..."), or "" for remote, unsafe or missing values. */
function localAssetPath(value = "") {
  const url = safeAssetUrl(String(value || "").trim());
  if (!url || /^https?:\/\//i.test(url)) return "";
  return `/${url.replace(/^\.?\//, "")}`;
}

function setMetaTag(html, attribute, name, value) {
  const tag = `<meta ${attribute}="${name}" content="${escapeAttribute(value)}">`;
  const pattern = new RegExp(`<meta\\s+${attribute}="${name.replace(".", "\\.")}"\\s+content="[^"]*"\\s*/?>`, "i");
  return pattern.test(html) ? html.replace(pattern, () => tag) : insertIntoHead(html, tag);
}

function setFavicon(html, href) {
  const tag = `href="${escapeAttribute(href)}"`;
  if (/<link\b[^>]*\brel="icon"[^>]*>/i.test(html)) {
    return html.replace(/(<link\b[^>]*\brel="icon"[^>]*?)\bhref="[^"]*"/i, (match, prefix) => `${prefix}${tag}`);
  }
  return insertIntoHead(html, `<link rel="icon" ${tag}>`);
}

function insertIntoHead(html, tag) {
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => `  ${tag}\n  </head>`) : html;
}

function escapeText(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value = "") {
  return escapeText(value).replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
