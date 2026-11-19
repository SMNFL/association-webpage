# Association Website With Local Editor

Reusable static association and culture website with an optional Node API for contact forms, an Instagram live feed, and a local website editor. The repository contains generic examples only. Deployment-specific content stays in ignored local overrides.

## Structure

- `public/` contains the website, assets, pages, and JSON data.
- `ui-web-edit-tool/` contains the local admin/editor for content maintenance.
- `server/` contains the public API, editor API, and local server integration.
- `tests/unit/` contains fast Node tests.
- `tests/e2e/` contains browser smoke tests, including the editor workflow.
- `docs/` contains operations, testing, and content-maintenance notes.
- `scripts/check-public-release.js` checks that local content is not published by accident.

## Local Development

```bash
npm install
npm run dev
```

`npm install` installs all dependencies locally into `node_modules/`. No globally installed Node packages are required. The website then runs at `http://localhost:8080` by default.

## Local Website Editor

```bash
npm run security:setup-editor
npm run editor
```

Open the editor at `http://127.0.0.1:8081/editor/` and log in with the local admin password. The editor only runs in `EDITOR_MODE=1` with `EDITOR_LOCAL_ONLY=true` on `127.0.0.1`, writes only allowlisted content files, and generates event artifacts from structured data.

With Docker, the default service starts the public website only. To run the local editor in Docker, first generate editor credentials and then start the opt-in editor profile:

```bash
npm run security:setup-editor
mkdir -p .editor-backups
docker compose up -d --build
docker compose --profile editor up -d --build editor
```

The normal website and the editor are separate services:

```text
Website: http://127.0.0.1:8080
Editor:  http://127.0.0.1:8081/editor/
```

Run only `docker compose up -d --build` when you want the public website only. Run both Docker commands above when you want the website and editor at the same time. The editor profile is bound to host localhost only and writes through bind mounts into your local `public/` files.

Stop only the Docker editor without stopping the public website:

```bash
docker compose --profile editor stop editor
```

Stop the public website too:

```bash
docker compose down
```

Important content files:

- `public/data/site.local.json`
- `public/data/instagram-feed.local.json`
- `public/data/pages.local.json`
- `public/data/culture.local.json`
- `public/data/events.content.json` contains local event data and is not committed.
- `public/data/events.default.json` is the committed generic template with every supported event field.
- `public/pages/events/*.html` is generated locally for event detail pages and is not committed.

Deployment-specific media under `public/assets/images/`, `public/assets/docs/`, `public/assets/videos/`, and almost all files under `public/assets/icons/` are ignored too. They remain usable locally but are not part of the reusable GitHub repository. The tracked placeholder `public/assets/icons/site-placeholder.svg` keeps a clean checkout renderable.

Events are maintained in the editor. Without a local event file, the website shows the generic examples from `events.default.json`; the first editor save creates `events.content.json`. Active and archived events use the same data shape. Active events can embed a safe HTTPS ticket shop as an iframe, keep the external ticket link as a fallback, and optionally set a bounded iframe height with a compact `316` pixel default. Archiving automatically disables ticket data; galleries remain available and are highlighted on archive pages.

Contact links are configured in `site.local.json` under `contactSection.socialLinks`, next to `contactSection.instagramLabel`. Visible Instagram preview cards are loaded live through the included server endpoint first. `instagram-feed.local.json` is used only when Instagram is unreachable. Details: [`docs/instagram.md`](docs/instagram.md).

The editor groups related fields as page elements: link text and target URL, for example, are edited together. The Pages view filters by homepage, subpage, and section; an explicit `All pages` mode remains available for global searches. The preview follows the selected page.

Under `Settings`, safe theme tokens such as colors, content width, radius, spacing, font style, and subtle effects can be adjusted. Changes appear in the preview first and are only saved to `site.theme` with `Save settings`. Arbitrary CSS is intentionally not accepted.

The Media section sorts images by event and archive folders. A folder filter like the Pages view shows `Homepage gallery` or a specific event folder. Event galleries expose the target event clearly. Each media card has four explicit actions: add to event gallery, add to main gallery, remove from event gallery, and remove from main gallery. Inapplicable actions are disabled. Removal requires confirmation and never deletes the media file.

The public site navigation stays visible at the top and automatically collapses into a dropdown when configured links no longer fit side by side. Local projects can add or rename navigation items without manually adjusting responsive breakpoints.

## Production

Recommended: **Docker Compose + Cloudflare Tunnel** (free). It needs no public IPv4, no port forwarding, no static IP and no reverse proxy on the server, so it works on a home connection such as DS-Lite. Cloudflare handles TLS, compression and the HTTP→HTTPS / `www`→apex redirects; a small `cloudflared` container connects outbound and reaches only the website.

```text
Visitor ──HTTPS──▶ Cloudflare ──outbound tunnel──▶ cloudflared ──HTTP (isolated Docker network)──▶ website:8080
```

Short version (full guide: [`docs/cloudflare-tunnel.md`](docs/cloudflare-tunnel.md)):

1. `cp .env.example .env` and fill it in. Set `TRUST_PROXY=private`, `SITE_URL`, SMTP and CAPTCHA.
2. Add the domain to Cloudflare (Free plan), copy all existing DNS records (especially mail), and switch the nameservers at the registrar.
3. Create a tunnel in Cloudflare Zero Trust and store **only the token** (`eyJ…`) in `secrets/cloudflare-tunnel-token`.
4. Add the tunnel routes `example.org` and `www.example.org` → `http://website:8080`.
5. Start and deploy with:

   ```bash
   docker compose --profile tunnel up -d --build
   ```

Without a tunnel (server with a public IP), run `docker compose up -d --build website` behind Caddy or Nginx; see [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md#alternative-direct-hosting-with-a-reverse-proxy). Static hosts are covered in [`docs/deployment.md`](docs/deployment.md#static-hosts).

Configuration reference: [`.env.example`](.env.example), the setup-dependent values in [`docs/deployment.md`](docs/deployment.md#environment), SMTP and CAPTCHA in [`docs/SELF_HOSTING.md`](docs/SELF_HOSTING.md#smtp). Test SMTP separately with `npm run smtp:check`.

## Tests

The E2E tests need a Playwright browser once per machine:

```bash
npx playwright install chromium
```

```bash
npm run release:check-public
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
```

Before production deployments and before the first public push, all commands should pass. `npm run release:check` combines the publish guard, syntax checks, unit tests, and E2E tests.

## Important Endpoints

- `POST /api/contact`
- `GET /api/instagram-feed?limit=4` self-hosted Instagram live feed for the server-configured account (`INSTAGRAM_USERNAME`; a `username` parameter is ignored)
- `GET /.netlify/functions/instagram-feed?limit=4` Netlify-compatible Instagram live feed
- `GET /robots.txt`, `GET /sitemap.xml` (sitemap needs `SITE_URL`), `GET /favicon.ico`
- `GET /healthz` returns `{ "ok": true }`
- `GET /editor/` only in `npm run editor` mode or the Docker `editor` profile

Netlify is not required for the static website. For live Instagram on a static host, use the included Netlify Function or an equivalent server-side endpoint. Contact forms need Netlify Forms or the Node API.

## Security

- The public website stays readable without login.
- `/editor` and `/api/editor/**` are only directly locally reachable and protected by password, session cookie, CSRF checks, forwarded-header rejection, login lockouts, and rate limits.
- Security headers, content sanitizing, URL allowlisting, upload signature checks, and API limits reduce common web risks.
- `.env` contains local secrets and must not be committed.
- Local JSON overrides, generated event pages, and deployment-specific media are intentionally ignored.

The full operations guide, rotation steps, and residual risks are in [`docs/SECURITY.md`](docs/SECURITY.md). For larger new features, update this README with a short summary and add an operations detail document under `docs/` when relevant.

## License

This repository is available for non-commercial use under the PolyForm Noncommercial License 1.0.0. Attribution to SMNFL Github page is required. See [`LICENSE.md`](LICENSE.md).

## First Public Release

1. Run `npm run release:check-public`.
2. Check `git status --short --ignored`: `.env`, `public/data/*.local.json`, `public/data/events.content.json`, `public/pages/events/`, and deployment-specific media must appear as ignored.
3. Review the generic defaults under `public/data/*.default.json` and examples under `public/data/*.example.json`.
4. Run the tests and audit from the `Tests` section.
5. Before committing, confirm that only the expected source, documentation, and example files are staged.

Details about the split between the reusable repository and private deployment content are in [`docs/deployment.md`](docs/deployment.md).
