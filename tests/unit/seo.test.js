import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPageMeta,
  buildPageMeta,
  buildRobotsTxt,
  buildSitemapXml,
  normalizeSiteUrl
} from "../../server/seo.js";

const SITE = {
  name: "Club",
  title: "Club | Culture",
  description: "A \"quoted\" <description>",
  language: "de",
  images: { logo: "assets/icons/logo.png", socialPreview: "assets/images/gallery/preview.jpg" }
};
const PAGES = { board: { title: "Vorstand", description: "Board members" } };
const HOME_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Community Space</title>
    <meta name="description" content="">
    <meta property="og:title" content="">
    <meta property="og:description" content="">
    <meta property="og:image" content="">
    <link data-favicon rel="icon" href="">
  </head>
  <body></body>
</html>`;
const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title></title>
    <meta name="description" content="">
  </head>
  <body data-page="board"></body>
</html>`;

test("site URL must be an absolute http(s) origin and loses its trailing slash", () => {
  assert.equal(normalizeSiteUrl("https://example.org/"), "https://example.org");
  assert.equal(normalizeSiteUrl("javascript:alert(1)"), "");
  assert.equal(normalizeSiteUrl(""), "");
});

test("homepage metadata is rendered server-side from the site config", () => {
  const meta = buildPageMeta({ html: HOME_HTML, pathname: "/index.html", site: SITE, pages: PAGES, siteUrl: "https://example.org" });
  const html = applyPageMeta(HOME_HTML, meta);

  assert.match(html, /<html lang="de">/);
  assert.match(html, /<title>Club \| Culture<\/title>/);
  assert.match(html, /<meta name="description" content="A &quot;quoted&quot; &lt;description&gt;">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/example.org\/assets\/images\/gallery\/preview.jpg">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.org\/">/);
  assert.match(html, /<link data-favicon rel="icon" href="\/assets\/icons\/logo.png">/);
});

test("content pages use their page title and description and get a canonical link", () => {
  const meta = buildPageMeta({ html: PAGE_HTML, pathname: "/pages/board.html", site: SITE, pages: PAGES, siteUrl: "https://example.org" });
  const html = applyPageMeta(PAGE_HTML, meta);

  assert.match(html, /<title>Vorstand \| Club<\/title>/);
  assert.match(html, /<meta name="description" content="Board members">/);
  assert.match(html, /<meta property="og:title" content="Vorstand \| Club">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.org\/pages\/board.html">/);
  assert.match(html, /<link rel="icon" href="\/assets\/icons\/logo.png">/);
});

test("pages without config keep their existing title", () => {
  const html = `<html lang="en"><head><title>Contact | Club</title></head><body></body></html>`;
  const output = applyPageMeta(html, buildPageMeta({ html, pathname: "/pages/contact.html", site: SITE, pages: PAGES, siteUrl: "" }));

  assert.match(output, /<title>Contact \| Club<\/title>/);
  assert.doesNotMatch(output, /canonical/);
});

test("sitemap lists absolute, escaped URLs with lastmod dates", () => {
  const xml = buildSitemapXml("https://example.org", [
    { path: "/", lastmod: new Date("2026-01-02T03:04:05Z") },
    { path: "/pages/a&b.html", lastmod: new Date("2026-02-03T00:00:00Z") }
  ]);

  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<loc>https:\/\/example.org\/<\/loc><lastmod>2026-01-02<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/example.org\/pages\/a&amp;b.html<\/loc>/);
});

test("robots.txt references the sitemap only when a site URL is configured", () => {
  assert.match(buildRobotsTxt("https://example.org"), /Sitemap: https:\/\/example.org\/sitemap.xml/);
  assert.doesNotMatch(buildRobotsTxt(""), /Sitemap/);
  assert.match(buildRobotsTxt(""), /User-agent: \*\nAllow: \//);
});

test("dollar sequences in configured text are inserted literally", () => {
  const site = { ...SITE, title: "A $& B $' C", description: "cost $$5" };
  const html = applyPageMeta(HOME_HTML, buildPageMeta({ html: HOME_HTML, pathname: "/", site, pages: PAGES, siteUrl: "" }));

  assert.match(html, /<title>A \$&amp; B \$&#039; C<\/title>|<title>A \$&amp; B \$' C<\/title>/);
  assert.match(html, /<meta name="description" content="cost \$\$5">/);
  assert.equal(html.match(/<title>/g).length, 1);
});
