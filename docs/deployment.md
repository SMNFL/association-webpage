# Deployment

The public website supports two deployment modes:

- Node self-hosting: run the server documented in `SELF_HOSTING.md` for contact mail, hCaptcha verification and live API routes.
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

## Security

Read [`SECURITY.md`](SECURITY.md) before deploying. If the host does not support Netlify-style `_headers`, configure equivalent CSP, MIME, frame, referrer and permissions headers in that host.
