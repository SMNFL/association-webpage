# Deployment

How to publish the website. The authenticated editor is local-only and is never part of a public deployment.

## Choose A Setup

| Setup | Use when | Public access | Guide |
|---|---|---|---|
| **Docker + Cloudflare Tunnel** (recommended) | Home server or any machine without public IPv4, port forwarding or static IP (e.g. DS-Lite) | IPv4 + IPv6 via Cloudflare, no inbound ports | [`cloudflare-tunnel.md`](cloudflare-tunnel.md) |
| Docker + reverse proxy (Caddy/Nginx) | Server with its own public IP and open TCP 80/443 | Direct, Let's Encrypt on the server | [`SELF_HOSTING.md`](SELF_HOSTING.md#alternative-direct-hosting-with-a-reverse-proxy) |
| Static host (Netlify, Cloudflare Pages, …) | No server; forms via the host's form service | Host-provided HTTPS | [Static Hosts](#static-hosts) |

Cloudflare Tunnel replaces the reverse proxy, the router port forwarding, DynDNS and Let's Encrypt on the server: Cloudflare terminates TLS, compresses, redirects HTTP→HTTPS and `www`→apex, and reaches the site through an outbound connection. The Caddy/DynDNS tooling in the repository (`deploy/Caddyfile`, `scripts/strato-dyndns.sh`) is only needed for the direct-hosting alternative.

## Requirements

| Tool | Needed for |
|---|---|
| Git, Node.js 22 (the version in the Docker image) | Install, tests, editor, release checks |
| Docker with Compose v2 (Docker Desktop on macOS) | Production runtime, Cloudflare Tunnel |
| Cloudflare account (Free) and access to the domain registrar | Cloudflare Tunnel setup |
| SMTP account and hCaptcha (or self-hosted mCaptcha) | Contact and membership forms |
| Python 3 with `curl_cffi` | Instagram feed when running Node **without** Docker (the image includes it) |
| ImageMagick 7 (`brew install imagemagick`) | `scripts/optimize-images.sh` only |
| Caddy or Nginx | Direct-hosting alternative only |

## New Deployment Checklist

1. Clone and install:

   ```bash
   git clone <repository-url> && cd <repository>
   ```

   ```bash
   npm ci
   ```

2. Create the configuration from the templates:

   ```bash
   cp .env.example .env
   ```

   Fill in `.env` (see [Environment](#environment)). For your own content, copy the `public/data/*.local.example.json` templates to `*.local.json` and edit them, or use the editor (`npm run security:setup-editor`, then `npm run editor`).

3. Check everything before going live:

   ```bash
   npm run release:check
   ```

4. Start the website (and, for the recommended setup, the tunnel):

   ```bash
   docker compose --profile tunnel up -d --build
   ```

   Without the tunnel: `docker compose up -d --build website`. The website then listens only on `127.0.0.1:8080`.

5. Verify the public response (see [`SECURITY.md`](SECURITY.md#https-and-header-verification)):

   ```bash
   curl -sI https://example.org/ | grep -iE "^HTTP|strict-transport|content-security"
   ```

Use the same `up -d --build` command for every later deploy; it rebuilds the image and recreates changed containers.

## Environment

`.env.example` is the reference. The values that depend on the setup:

| Variable | Cloudflare Tunnel | Reverse proxy, Node in Docker | Reverse proxy, Node on host |
|---|---|---|---|
| `NODE_ENV` | `production` (set by the Docker image) | `production` | `production` |
| `TRUST_PROXY` | `private` | `private` | `loopback` |
| `SITE_URL` | `https://example.org` | same | same |

Always required in production: SMTP (`SMTP_HOST`, `SMTP_FROM`, `CONTACT_TO`, credentials) and a CAPTCHA provider (`CAPTCHA_PROVIDER=hcaptcha` with `HCAPTCHA_SITE_KEY`/`HCAPTCHA_SECRET`, or mCaptcha). Optional: `INSTAGRAM_USERNAME`, `EDITOR_BACKUP_KEEP`. Details: [`SELF_HOSTING.md`](SELF_HOSTING.md#smtp) (SMTP, CAPTCHA) and [`SECURITY.md`](SECURITY.md#production).

Secrets never go into Git: `.env`, `.env.dyndns` and `secrets/` (Cloudflare Tunnel token) are ignored by Git and Docker builds and blocked by `npm run release:check-public`.

## Public Repository And Private Deployment Data

The repository contains generic defaults and examples only. Real content stays in ignored local files:

- `public/data/*.local.json`, `public/data/events.content.json`
- generated `public/pages/events/*.html` (except the committed example pages)
- media under `public/assets/images/`, `public/assets/docs/`, `public/assets/videos/` and local icons

A clean checkout renders the generic defaults. A real deployment is built from the private working copy (Docker copies `public/` into the image) or from a separate private content pipeline; a Git-based deployment of the public repository cannot publish ignored files.

Before pushing:

```bash
npm run release:check-public
```

```bash
git status --short --ignored
```

## Static Hosts

Publish the `public/` directory (no build step):

- Netlify: publish directory `public`; keep `netlify/functions/instagram-feed.js` enabled (set `INSTAGRAM_USERNAME` in the Netlify environment).
- Cloudflare Pages / Vercel: output directory `public`, empty build command.
- GitHub Pages: publish `public/`.

`public/_headers` contains the security headers for Netlify-compatible hosts; elsewhere configure equivalent CSP, HSTS, frame, MIME, referrer and permissions headers. Static hosting has no SMTP or CAPTCHA verification: forms need the host's form service (e.g. Netlify Forms). The authenticated editor and the SEO routes below are Node-only.

## Instagram Feed

The homepage requests `/api/instagram-feed?limit=4` (Node) and falls back to `/.netlify/functions/instagram-feed?limit=4`, then to the local fallback JSON. The account is fixed on the server (`INSTAGRAM_USERNAME` or site config). Details: [`instagram.md`](instagram.md).

## SEO And Crawlers

The Node server renders page metadata server-side, so crawlers and link previews do not need JavaScript:

- The homepage gets `<title>`, description, Open Graph tags, `lang` and the favicon from the site config; content pages use their entry in the pages config.
- With `SITE_URL` set, every page gets a canonical link, `/sitemap.xml` lists the homepage, content pages and generated event pages, and `/robots.txt` points to the sitemap.
- `/favicon.ico` redirects to `images.logo` from the site config.

Static hosts serve `public/robots.txt` without a sitemap line.

## Performance

- Media and fonts under `/assets/` are cached for 7 days; uploads always get new file names. HTML, CSS, JS and data revalidate so edits show up immediately.
- Compression: automatic with Cloudflare; with a reverse proxy enable it there (`encode zstd gzip` in [`deploy/Caddyfile`](../deploy/Caddyfile)).
- Shrink oversized published images before deploying (dry run first; touches only images above 300 KB outside `*/original/*`, backups in `.image-backups/`):

  ```bash
  scripts/optimize-images.sh
  ```

  ```bash
  scripts/optimize-images.sh --apply
  ```
