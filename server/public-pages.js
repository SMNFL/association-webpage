import express from "express";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { loadMergedPublicJson } from "./public-data.js";
import { applyPageMeta, buildPageMeta, buildRobotsTxt, buildSitemapXml, normalizeSiteUrl } from "./seo.js";
import { safeAssetUrl } from "./security/content-safety.js";

const HTML_PAGE_PATH = /^\/(?:index\.html)?$|^\/pages\/(?:events\/)?[a-z0-9-]+\.html$/i;
const FORM_PAGES = new Set(["/pages/contact.html", "/pages/membership.html"]);
// Query-driven templates render nothing useful without parameters, so they stay out of the sitemap.
const SITEMAP_EXCLUDED_PAGES = new Set(["event.html", "culture-detail.html"]);
const DEFAULT_FAVICON = "/assets/icons/site-placeholder.svg";
// Full-resolution archive originals are kept for the editor and backups, not for visitors.
// Tested on the decoded, case-insensitive path because express.static decodes and the host FS may ignore case.
const ORIGINAL_IMAGE_PATH = /^\/assets\/images\/(?:.*\/)?original(?:\/|$)/i;
const NOT_FOUND_HTML = "<h1>404</h1><p>Page not found.</p>";

/**
 * Public HTML, SEO and favicon routes. Mount before express.static.
 * @param {{ publicDir: string, getSiteUrl?: () => string }} options
 */
export function createPublicPagesRouter({ publicDir, getSiteUrl = () => normalizeSiteUrl(process.env.SITE_URL) }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!req.path.toLowerCase().startsWith("/assets/images/")) return next();
    const decodedPath = safeDecodePath(req.path);
    if (decodedPath === null || ORIGINAL_IMAGE_PATH.test(decodedPath)) {
      return res.status(404).type("html").send(NOT_FOUND_HTML);
    }
    return next();
  });

  router.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(buildRobotsTxt(getSiteUrl()));
  });

  router.get("/sitemap.xml", async (req, res, next) => {
    const siteUrl = getSiteUrl();
    if (!siteUrl) return next();
    try {
      res.type("application/xml").send(buildSitemapXml(siteUrl, await sitemapEntries(publicDir)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/favicon.ico", async (req, res, next) => {
    try {
      const site = await loadMergedPublicJson(publicDir, "site.default.json", "site.local.json");
      const logo = safeAssetUrl(site.images?.logo || "");
      const target = logo && !/^https?:\/\//i.test(logo) ? `/${logo.replace(/^\.?\//, "")}` : DEFAULT_FAVICON;
      res.redirect(301, target);
    } catch (error) {
      next(error);
    }
  });

  router.get(HTML_PAGE_PATH, async (req, res, next) => {
    try {
      const pathname = req.path.toLowerCase();
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
      const html = await readFile(path.join(publicDir, relativePath), "utf8");
      const [site, pages] = await Promise.all([
        loadMergedPublicJson(publicDir, "site.default.json", "site.local.json"),
        loadMergedPublicJson(publicDir, "pages.default.json", "pages.local.json")
      ]);
      const pageHtml = FORM_PAGES.has(pathname) ? enhanceFormPage(html) : html;
      const meta = buildPageMeta({ html: pageHtml, pathname, site, pages, siteUrl: getSiteUrl() });
      res.type("html").send(applyPageMeta(pageHtml, meta));
    } catch (error) {
      if (error.code === "ENOENT") return next();
      next(error);
    }
  });

  return router;
}

/** Points the first form at the server-side contact handler and loads the progressive-enhancement script. */
export function enhanceFormPage(html) {
  const output = html.replace(/<form\b([^>]*)>/i, (match, attrs) => {
    const nextAttrs = attrs
      .replace(/\saction=(["']).*?\1/i, "")
      .replace(/\smethod=(["']).*?\1/i, "");
    return `<form${nextAttrs} method="post" action="/api/contact">`;
  });

  return /\/js\/contact\.js/.test(output)
    ? output
    : output.replace("</body>", '<script type="module" src="../js/contact.js"></script></body>');
}

function safeDecodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function sitemapEntries(publicDir) {
  const entries = [{ path: "/", lastmod: await modifiedAt(path.join(publicDir, "index.html")) }];
  for (const directory of ["pages", "pages/events"]) {
    const names = await htmlFiles(path.join(publicDir, directory));
    for (const name of names) {
      if (SITEMAP_EXCLUDED_PAGES.has(name)) continue;
      entries.push({ path: `/${directory}/${name}`, lastmod: await modifiedAt(path.join(publicDir, directory, name)) });
    }
  }
  return entries;
}

async function htmlFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^[a-z0-9-]+\.html$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function modifiedAt(filePath) {
  try {
    return (await stat(filePath)).mtime;
  } catch {
    return undefined;
  }
}
