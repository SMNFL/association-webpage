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

In Docker, use the explicit Compose `editor` profile. It publishes the editor on host `127.0.0.1` only and sets `EDITOR_ALLOW_DOCKER_BRIDGE=1` so Docker's private bridge gateway can pass the localhost guard. Do not publish that profile on `0.0.0.0` or through a public reverse proxy.

## Rotation

Rotate the password or session secret:

```bash
npm run security:setup-editor
```

Then restart the running editor process. Existing sessions become invalid.

## Website Protection Layers

- Node responses set CSP, MIME protection, frame rules, referrer policy, permissions policy, and HSTS in production.
- `public/_headers` contains equivalent headers for Netlify-compatible static hosts.
- Rich HTML fields are sanitized server-side on save and client-side on render.
- Links, assets, CSS image positions, and iframe sources are processed through shared allowlist helpers.
- Uploads allow only JPG, PNG, WebP, and GIF, up to 8 MB, with matching file signatures. SVG uploads are blocked.
- Contact forms have size limits, field limits, server-side validation, and an IP-based rate limit.
- Instagram requests have timeouts. Image proxying accepts only expected Instagram CDN hosts and limits download sizes.

## Production

Run the public Node website with `npm run start` behind HTTPS. A reverse proxy must terminate TLS and preserve the standard headers. SMTP secrets and optional `HCAPTCHA_SECRET` belong only in the server environment.

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
```

Update dependencies regularly and review security advisories. If a secret leaks, rotate `.env`, restart the process, and replace affected external credentials too.

## Residual Risks

- Local filesystem or user-account access is outside the website boundary.
- Third-party embeds load code or content from their providers.
- Static hosts must actually apply `public/_headers` or configure equivalent headers.
- hCaptcha protection is active only when `HCAPTCHA_SECRET` is set server-side and the matching visible site key is delivered to the browser through `HCAPTCHA_SITE_KEY` or local JSON configuration.
