# Security

The website uses defense in depth. No website can be guaranteed safe against every future exploit. This document describes the active protection layers and the remaining operational tasks.

## Local Editor

The editor is intentionally not a remote CMS. It starts only with:

```bash
npm install
npm run security:setup-editor
npm run editor
```

All Node dependencies live locally under `node_modules/`. The setup command writes a `scrypt` password hash and random session secret to `.env`. The plaintext password is not stored. `.env` is excluded by `.gitignore`.

Editor address:

```text
http://127.0.0.1:8081/editor/
```

The editor binds only to `127.0.0.1`. Router middleware also rejects non-local access. Editor pages and editor APIs require login. Write requests additionally require a valid CSRF token and matching origin.

`EDITOR_LOCAL_ONLY=true` is required whenever `EDITOR_MODE=1`. Editor requests with `Forwarded` or `X-Forwarded-*` headers are rejected so a public reverse proxy cannot accidentally turn proxy-local traffic into editor access. Do not proxy `/editor` or `/api/editor` from the public website.

Remote editor access should use a private channel, not a public route. Example SSH tunnel:

```bash
ssh -L 8081:127.0.0.1:8081 user@server
```

Then open:

```text
http://127.0.0.1:8081/editor/
```

In Docker, use the explicit Compose `editor` profile. It publishes the editor on host `127.0.0.1` only and sets `EDITOR_ALLOW_DOCKER_BRIDGE=1` so Docker's private bridge gateway can pass the localhost guard. Do not publish that profile on `0.0.0.0` or through a public reverse proxy.

## Rotation

Rotate the password or session secret:

```bash
npm run security:setup-editor
```

Then restart the running editor process. Existing sessions become invalid.

Rotate external secrets at their provider too if they were exposed: SMTP password, CAPTCHA provider secret, hosting tokens, or DNS/API tokens. After rotation, update `.env`, restart the service, and verify contact forms still work.

## Website Protection Layers

- Node responses set CSP, MIME protection, frame rules, referrer policy, permissions policy, and HSTS in production.
- `public/_headers` contains equivalent headers for Netlify-compatible static hosts.
- Rich HTML fields are sanitized server-side on save and client-side on render.
- Links, assets, CSS image positions, and iframe sources are processed through shared allowlist helpers.
- Uploads allow only JPG, PNG, WebP, and GIF, up to 8 MB, with matching file signatures. SVG uploads are blocked.
- Contact forms have size limits, field limits, server-side validation, and an IP-based rate limit.
- Production contact submissions require a same-origin `Origin` or `Referer` header.
- Editor login has per-IP throttling, global throttling, progressive lockouts, generic errors and failed-login security logs.
- Editor API and media upload endpoints have additional authenticated rate limits.
- The Instagram endpoint fetches one server-configured account only (`INSTAGRAM_USERNAME` or site config); the `username` query parameter is ignored. Successes are cached for 10 minutes, failures for 5 minutes, and concurrent requests share one fetch, so visitors cannot trigger repeated scraper processes. Error responses are generic; details go to the server log. Requests have timeouts, and image proxying accepts only expected Instagram CDN hosts with size limits.
- Contact email addresses must be plain dot-atom addresses (no quotes, comments, angle brackets or separators) because they become the `Reply-To` header.
- hCaptcha verification sends the configured site key, so tokens issued for other sites are rejected. The default mCaptcha widget script is loaded with Subresource Integrity.
- In-memory rate-limit, lockout and editor-session tables drop expired entries, so many distinct client IPs cannot grow memory without bound.
- Full-resolution archive images under `assets/images/**/original/` are never served publicly (404) and are excluded from the Docker image.
- `/healthz` returns only `{ "ok": true }`.
- Security logs are structured JSON on stderr/stdout and intentionally omit passwords, cookies, tokens and captcha values.

## Production

Run the public Node website with `npm run start` behind HTTPS. A reverse proxy must terminate TLS and preserve the standard headers. SMTP, hCaptcha, and mCaptcha secrets belong only in the server environment.

Important environment variables:

```env
NODE_ENV=production
TRUST_PROXY=false
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=mail-user
SMTP_PASS=mail-password
SMTP_FROM=website@example.org
CONTACT_TO=contact@example.org
CAPTCHA_PROVIDER=hcaptcha
HCAPTCHA_SITE_KEY=public-site-key
HCAPTCHA_SECRET=private-secret
CONTACT_ALLOW_WITHOUT_CAPTCHA=0
```

Choose `TRUST_PROXY` by the address the Node process actually sees for proxied requests:

- `loopback`: Node runs directly on the host and the reverse proxy (Caddy, Nginx) connects via `127.0.0.1`.
- `private`: Node runs in Docker behind a host reverse proxy. Docker's port mapping delivers requests from the bridge gateway (for example `172.17.0.1` or `192.168.65.1`), which is a private address, not loopback.
- `false`: nothing sits in front of Node.

With the wrong value every visitor shares one IP: the contact-form limit (5 per 15 minutes) then applies to the whole site and one person can block the form for everyone. Do not use broad `true` proxy trust. Caddy replaces client-supplied `X-Forwarded-For` headers by default, so the forwarded IP cannot be spoofed through it.

In production, contact mail configured through `SMTP_HOST` and `CONTACT_TO` requires a selected CAPTCHA provider unless `CONTACT_ALLOW_WITHOUT_CAPTCHA=1` is deliberately set. That opt-out is intended only for deployments with equivalent upstream abuse protection.

CAPTCHA provider selection:

- `CAPTCHA_PROVIDER=none`: no server-side CAPTCHA verification. Use this with production mail only when upstream rate limits, WAF, or another abuse control exists.
- `CAPTCHA_PROVIDER=hcaptcha`: requires `HCAPTCHA_SITE_KEY` and `HCAPTCHA_SECRET`.
- `CAPTCHA_PROVIDER=mcaptcha`: requires `MCAPTCHA_VERIFY_URL`, `MCAPTCHA_SITE_KEY`, `MCAPTCHA_SECRET`, and `MCAPTCHA_WIDGET_URL`. `MCAPTCHA_SCRIPT_URL` is optional.
- If `CAPTCHA_PROVIDER` is unset, the server auto-selects none, hCaptcha, or mCaptcha only when the config is unambiguous.

For Node/Docker deployments, CAPTCHA env vars are the source of truth. The server injects public CAPTCHA config into served JSON responses; do not duplicate CAPTCHA config in local JSON. Static-only hosting can use the browser-visible `captcha` object in ignored local JSON because there is no server env at runtime.

The editor does not belong on a public server. Remote administration needs a separate design with HTTPS, persistent storage, proxy configuration, and additional access control.

## Backups And File Permissions

The editor writes backups under `.editor-backups/` before file changes and keeps only the newest 50 snapshot folders (`EDITOR_BACKUP_KEEP` changes the number). `scripts/optimize-images.sh --apply` stores replaced images under `.image-backups/`. These folders and `.env` must not be publicly served; both are excluded from Git and the Docker image. Operating-system file permissions and server updates remain operator responsibilities.

Local JSON overrides, generated event pages, and deployment-specific media are also excluded by `.gitignore`. Before a public push, check:

```bash
npm run release:check-public
git status --short --ignored
```

The guard blocks known local paths from the Git publication scope. It does not replace manual review of newly added text, URLs, or media.

## Maintenance

Before deployments:

```bash
npm run check
npm test
npm run test:e2e
npm audit --omit=dev
npm run release:check-public
```

Update dependencies regularly and review security advisories. If a secret leaks, rotate `.env`, restart the process, and replace affected external credentials too.

## Residual Risks

- Local filesystem or user-account access is outside the website boundary.
- Third-party embeds load code or content from their providers.
- Static hosts must actually apply `public/_headers` or configure equivalent headers.
- CAPTCHA protection is active only when the selected provider has its server-side secret configured and the matching public widget config is delivered to the browser.
- Static hosts using mCaptcha must add the mCaptcha script origin to `script-src`, the widget origin to `frame-src`, and the verify/widget origins to `connect-src` in their `_headers` or equivalent host configuration.
- The CSP keeps `img-src https:` because events may reference remote HTTPS images, and `style-src 'unsafe-inline'` because the ticket-shop embed and theme colors use inline styles. Scripts remain restricted to `'self'` plus the listed providers.
- Membership applications include IBAN, BIC, date of birth and address and are delivered by email in plain text (only the raw dump is redacted). They stay in the receiving mailbox until someone deletes them; see [`membership.md`](membership.md) for the retention rule.
- Outside `NODE_ENV=production` server errors include the underlying message. The Docker image always sets `NODE_ENV=production`; do not expose a development server publicly.
- A home-hosted setup depends on the ISP: a changed IPv6 prefix takes the site offline until DNS follows (see the DynDNS section in [`SELF_HOSTING.md`](SELF_HOSTING.md)), and an IPv6-only DNS record is unreachable for IPv4-only visitors. Cloudflare Tunnel removes both problems and all inbound ports.
- With Cloudflare Tunnel, TLS from visitors terminates at Cloudflare, which can read all traffic including form submissions; name Cloudflare as processor in the privacy policy. The tunnel token grants control of the connector: keep it only in `secrets/cloudflare-tunnel-token`, never in `.env`, Git or images, and refresh it in the dashboard if exposed. Never route the editor or mCaptcha through the tunnel. Details: [`cloudflare-tunnel.md`](cloudflare-tunnel.md#security-considerations).

## HTTPS And Header Verification

After DNS and TLS are live, verify the public response:

```bash
curl -I https://simonswelt.de/
```

Confirm these headers are present:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options`
- `Referrer-Policy`
- `Permissions-Policy`

Also confirm HTTP redirects to HTTPS at the reverse proxy or hosting provider.

## Public Release Checklist

- Rotate editor password/session secret with `npm run security:setup-editor`.
- Rotate any SMTP, hCaptcha, mCaptcha, or editor secret that may have been shared outside the host.
- Keep `.env`, `.env.dyndns`, `secrets/`, `.editor-backups/`, local JSON overrides, generated pages and private media out of Git and public static hosting.
- Set `NODE_ENV=production`, `TRUST_PROXY` (usually `private` for Docker behind Caddy), `SITE_URL`, SMTP variables, and one CAPTCHA mode (`none`, `hcaptcha`, or `mcaptcha`).
- Run `npm audit --omit=dev` and fix advisories before each release.
- Keep `EDITOR_MODE` off for the public website. If the editor is started separately, set `EDITOR_LOCAL_ONLY=true`.
- Do not proxy `/editor` or `/api/editor` from the public domain.
- Run `npm run release:check`, then inspect `git status --short --ignored`.
- Keep CDN/WAF or host-level request limits enabled for public traffic.
