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
http://127.0.0.1:8080/editor/
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

Rotate external secrets at their provider too if they were exposed: SMTP password, hCaptcha secret, hosting tokens, or DNS/API tokens. After rotation, update `.env`, restart the service, and verify contact forms still work.

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
- Instagram requests have timeouts. Image proxying accepts only expected Instagram CDN hosts and limits download sizes.
- Security logs are structured JSON on stderr/stdout and intentionally omit passwords, cookies, tokens and captcha values.

## Production

Run the public Node website with `npm run start` behind HTTPS. A reverse proxy must terminate TLS and preserve the standard headers. SMTP secrets and `HCAPTCHA_SECRET` belong only in the server environment.

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
HCAPTCHA_SITE_KEY=public-site-key
HCAPTCHA_SECRET=private-secret
CONTACT_ALLOW_WITHOUT_CAPTCHA=0
```

Use `TRUST_PROXY=loopback` when a local reverse proxy such as Caddy or Nginx forwards to the Node process on the same host. Use `TRUST_PROXY=private` only when requests come through a trusted private proxy network. Do not use broad `true` proxy trust.

In production, contact mail configured through `SMTP_HOST` and `CONTACT_TO` requires `HCAPTCHA_SECRET` unless `CONTACT_ALLOW_WITHOUT_CAPTCHA=1` is deliberately set. That opt-out is intended only for deployments with equivalent upstream abuse protection.

The editor does not belong on a public server. Remote administration needs a separate design with HTTPS, persistent storage, proxy configuration, and additional access control.

## Backups And File Permissions

The editor writes backups under `.editor-backups/` before file changes. These files and `.env` must not be publicly served. Operating-system file permissions, server updates, and backup retention remain operator responsibilities.

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
- hCaptcha protection is active only when `HCAPTCHA_SECRET` is set server-side and the matching visible site key is delivered to the browser through `HCAPTCHA_SITE_KEY` or local JSON configuration.

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
- Rotate any SMTP or hCaptcha secret that may have been shared outside the host.
- Keep `.env`, `.editor-backups/`, local JSON overrides, generated pages and private media out of Git and public static hosting.
- Set `NODE_ENV=production`, `TRUST_PROXY`, SMTP variables, `HCAPTCHA_SITE_KEY`, and `HCAPTCHA_SECRET`.
- Keep `EDITOR_MODE` off for the public website. If the editor is started separately, set `EDITOR_LOCAL_ONLY=true`.
- Do not proxy `/editor` or `/api/editor` from the public domain.
- Run `npm run release:check`, then inspect `git status --short --ignored`.
- Keep CDN/WAF or host-level request limits enabled for public traffic.
