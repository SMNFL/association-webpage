# Deployment

The public website supports two deployment modes:

- Node self-hosting: run the server documented in `SELF_HOSTING.md` for contact mail, optional CAPTCHA verification, and live API routes.
- Static hosting: deploy `public/`. `public/_headers` contains Netlify-compatible security headers, but static hosting needs Netlify Forms or another form backend for submissions.

The authenticated editor is intentionally local-only and is never part of a static deployment.

## Public Repository And Private Deployment Data

The reusable GitHub repository contains generic defaults and examples only. Real content stays in ignored local overrides:

- `public/data/*.local.json`
- `public/data/events.content.json`
- generated deployment-specific `public/pages/events/*.html` pages, except the committed generic default example pages
- deployment media under `public/assets/images/`, `public/assets/docs/`, `public/assets/videos/`, and local icons

A clean checkout renders generic defaults and the tracked placeholder icon. A real deployment that needs private text, generated event wrappers, or local media must be assembled from the private working copy or from a separate private asset/content pipeline. A Git-based deployment of the public repository intentionally cannot publish ignored private files.

Before publishing the repository:

```bash
npm run release:check-public
git status --short --ignored
```

## Local Preview

```bash
cd public
python3 -m http.server 8080
```

## Static Hosts

Recommended hosts:

- Netlify: connect the repo, set publish directory to `public`, and keep the included Netlify function enabled
- Vercel: import the repo and set output directory to `public`
- Cloudflare Pages: set build command empty and output directory `public`
- GitHub Pages: publish from `public/` or copy contents to the configured Pages branch/folder

## Instagram Feed

The homepage requests `/api/instagram-feed?username=...&limit=4` first for self-hosted Node deployments. If that route is unavailable, it tries `/.netlify/functions/instagram-feed?username=...&limit=4` for Netlify/static deployments. If live requests fail, the browser loads the configured fallback JSON file.

Deploying only the `public/` directory without the function still renders the fallback cards, but it cannot update Instagram posts automatically.

## No Build Step For The Static Site

There is no package install and no build command for the static frontend. This keeps updates easy for non-developers.

For Node self-hosting and local editor usage, run `npm install`. Packages remain isolated in the project's local `node_modules/` directory.

## Home Hosting Through Cloudflare Tunnel

Without a public IPv4 or port forwarding, run the optional `cloudflared` service next to the website. It connects outbound to Cloudflare, publishes no ports, and reaches only the website over an isolated Docker network:

```bash
docker compose --profile tunnel up -d --build
```

The token goes into `secrets/cloudflare-tunnel-token` (ignored by Git, Docker builds and the release check). Use the same command for every later deploy so the tunnel restarts with the website. Full guide: [`cloudflare-tunnel.md`](cloudflare-tunnel.md).

## Security

Read [`SECURITY.md`](SECURITY.md) before deploying. If the host does not support Netlify-style `_headers`, configure equivalent CSP, MIME, frame, referrer and permissions headers in that host.

For Node self-hosting, set these security-related variables explicitly:

```env
NODE_ENV=production
# private for Docker behind Caddy/Nginx on the same host, loopback for Node directly on the host
TRUST_PROXY=private
SITE_URL=https://example.org
INSTAGRAM_USERNAME=example
CAPTCHA_PROVIDER=hcaptcha
HCAPTCHA_SITE_KEY=your-public-site-key
HCAPTCHA_SECRET=your-private-secret
CONTACT_ALLOW_WITHOUT_CAPTCHA=0
```

Leave `CAPTCHA_PROVIDER` empty to auto-select from provider-specific config. Use `CAPTCHA_PROVIDER=none` only when `CONTACT_ALLOW_WITHOUT_CAPTCHA=1` is intentionally set with equivalent upstream abuse protection. For self-hosted mCaptcha, set `CAPTCHA_PROVIDER=mcaptcha`, `MCAPTCHA_VERIFY_URL`, `MCAPTCHA_SITE_KEY`, `MCAPTCHA_SECRET`, and `MCAPTCHA_WIDGET_URL`.

Keep the editor out of the public deployment. If you start the separate editor service, set `EDITOR_LOCAL_ONLY=true` and access it through localhost, SSH tunnel, VPN, or another private admin network only.

Before publishing:

```bash
npm run release:check
curl -I https://simonswelt.de/
```

The HTTPS response should include CSP, HSTS, frame, MIME, referrer and permissions headers.

## SEO And Crawlers

The Node server renders page metadata server-side, so crawlers and link previews do not need JavaScript:

- The homepage gets `<title>`, description, Open Graph tags, `lang` and the favicon from the site config; content pages use their entry in the pages config.
- With `SITE_URL` set, every page gets a canonical link, `/sitemap.xml` lists the homepage, content pages and generated event pages, and `/robots.txt` points to the sitemap.
- `/favicon.ico` redirects to `images.logo` from the site config.

Static hosts serve `public/robots.txt` without a sitemap line; add a sitemap there if needed.

## Performance

- Media and fonts under `/assets/` are cached for 7 days; uploads always get new file names, so cached copies never go stale. HTML, CSS, JS and data keep revalidation so edits show up immediately.
- Enable compression in the reverse proxy (`encode zstd gzip` in [`deploy/Caddyfile`](../deploy/Caddyfile)).
- Shrink oversized published images before deploying. The script only touches images above 300 KB outside `*/original/*`, keeps a rewritten file only when it is smaller, and backs up replaced files to `.image-backups/`:

  ```bash
  scripts/optimize-images.sh
  ```

  ```bash
  scripts/optimize-images.sh --apply
  ```
