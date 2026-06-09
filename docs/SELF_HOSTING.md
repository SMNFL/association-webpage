# Self-Hosting

The website can run as a Node service on your own server. The Node server serves static files from `public/` and exposes APIs under `/api/...`.

## Start

```bash
npm install --omit=dev
NODE_ENV=production TRUST_PROXY=loopback PORT=8080 npm run start
```

`npm install` installs dependencies locally under `node_modules/`. The public Node service does not serve the editor. The editor is started separately and only locally with `npm run editor`. Details: [`SECURITY.md`](SECURITY.md).

## Docker / Raspberry Pi

For a small server or Raspberry Pi, Docker Compose is the simplest reproducible setup:

```bash
docker compose up -d --build
```

Open locally:

```text
http://localhost:8080
```

Stop and remove containers:

```bash
docker compose down
```

```bash
# Stop only, keep containers
docker compose stop
```

```bash
# Start again later without rebuilding
docker compose up -d
```

Be careful: this command also removes stored volume data. Use it only when you really want that:

```bash
docker compose down -v
```

The Compose file intentionally binds the Node service only to `127.0.0.1:8080`. In production, put it behind Nginx, Caddy, or Traefik with HTTPS. If you want to test the service directly on your LAN, deliberately change the port line to `8080:8080`.

The default container starts only the public website. Runtime secrets come from `env_file: .env`.

### Optional Docker Editor

The editor is opt-in because it can modify local content files. Generate editor credentials once:

```bash
npm run security:setup-editor
mkdir -p .editor-backups
```

Start the website and editor together:

```bash
docker compose up -d --build
docker compose --profile editor up -d --build editor
```

The normal website and the editor are separate services:

```text
Website: http://127.0.0.1:8080
Editor:  http://127.0.0.1:8081/editor/
```

Run only `docker compose up -d --build` when you want the public website only. Run both Docker commands above when you want the website and editor at the same time.

Stop only the Docker editor without stopping the public website:

```bash
docker compose --profile editor stop editor
```

Stop the public website too:

```bash
docker compose down
```

The editor service sets `EDITOR_MODE=1`, binds the container process to `0.0.0.0` so Docker port forwarding works, and publishes it only on host `127.0.0.1:${EDITOR_PORT:-8081}`. It also enables `EDITOR_ALLOW_DOCKER_BRIDGE=1`, which allows Docker's private bridge address through the editor's localhost guard. Do not expose this service through a public reverse proxy.

`EDITOR_LOCAL_ONLY=true` is required for editor startup. If you need to reach the editor from another machine, use SSH tunneling or a VPN/private admin network. For SSH:

```bash
ssh -L 8081:127.0.0.1:8081 user@server
```

Then open `http://127.0.0.1:8081/editor/` locally.

### Optional Docker mCaptcha

The website does not require mCaptcha. To experiment with a local self-hosted mCaptcha instance, start the optional profile:

```bash
docker compose --profile mcaptcha up -d mcaptcha-db mcaptcha
```

The profile adds `mcaptcha/mcaptcha:latest` plus Postgres and binds the service to `127.0.0.1:${MCAPTCHA_PORT:-7000}`. mCaptcha itself needs its own site configuration, account setup, and HTTPS reverse proxy for production. The upstream mCaptcha docs also support running their official Docker Compose deployment separately; in that case, point this website at it with `MCAPTCHA_VERIFY_URL` and `MCAPTCHA_WIDGET_URL`.

The editor service bind-mounts `./public` into the container, so saved content is written back to your local working copy. Use the normal website service for public deployment.

## Optional Local Nginx On macOS

Nginx is not required for normal local development. Use it only if you want to test locally through `http://localhost` instead of `http://localhost:8080`.

Install and start:

```bash
brew install nginx
brew services start nginx
```

Homebrew Nginx configuration is usually at one of these paths:

```text
/opt/homebrew/etc/nginx/nginx.conf
/usr/local/etc/nginx/nginx.conf
```

Additional server configs often live here:

```text
/opt/homebrew/etc/nginx/servers/
/usr/local/etc/nginx/servers/
```

Example local reverse proxy:

```nginx
server {
  listen 80;
  server_name localhost;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Test and restart:

```bash
nginx -t
brew services restart nginx
```

Then open:

```text
http://localhost
```

## Custom Domain And HTTPS

The Node app should not be directly exposed to the internet in production. Let it run locally on `127.0.0.1:8080` and provide HTTPS with a reverse proxy.

Requirements:

- A domain, for example `example.org`
- DNS `A`/`AAAA` record points to the server's public IP
- Router/firewall forwards ports `80` and `443` to the server
- The app runs locally, for example with `docker compose up -d --build`

If you do not control a domain, you cannot create a valid Let's Encrypt certificate for it. Use `http://localhost:8080`, a provider URL, or a tunnel for testing instead.

The Compose file already binds the app port locally:

```yaml
ports:
  - "127.0.0.1:8080:8080"
```

### Caddy Recommended

Caddy is usually the easiest option for small self-hosted setups because it creates and renews Let's Encrypt certificates automatically.

Install:

```bash
sudo apt update
sudo apt install caddy
```

Edit `/etc/caddy/Caddyfile`:

```caddy
example.org {
  reverse_proxy 127.0.0.1:8080
}
```

Reload:

```bash
sudo systemctl reload caddy
```

For `www` too:

```caddy
example.org, www.example.org {
  reverse_proxy 127.0.0.1:8080
}
```

### Nginx Alternative

```nginx
server {
  listen 80;
  server_name example.org www.example.org;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/sukura /etc/nginx/sites-enabled/sukura
sudo nginx -t
sudo systemctl reload nginx
```

HTTPS with Certbot:

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d example.org -d www.example.org
```

HTTPS should always be enabled in production through Let's Encrypt or an equivalent TLS setup.

The application sets security headers itself. The reverse proxy must not remove those headers. HSTS is added in production.

Set `TRUST_PROXY=loopback` when Caddy or Nginx runs on the same host and forwards to `127.0.0.1:8080`. Use `TRUST_PROXY=private` only when the reverse proxy is on a trusted private network. Leave `TRUST_PROXY=false` when the Node app is not behind a proxy. The app intentionally rejects broad proxy trust values.

Do not expose the editor through this public reverse proxy. Start it only locally with `npm run editor` and use `http://127.0.0.1:8080/editor/`.

## Without Your Own Website URL

You can still run and test the project locally or publicly.

Local:

```text
http://localhost:8080
```

Or with local Nginx:

```text
http://localhost
```

Free public hosting URLs without your own domain:

```text
GitHub Pages: https://yourname.github.io/repository-name/
Vercel:       https://your-project.vercel.app/
Netlify:      https://your-project.netlify.app/
Render:       https://your-project.onrender.com/
```

These platforms usually provide HTTPS automatically. For purely static hosting, server-side features such as SMTP, CAPTCHA verification, and the Node Instagram endpoint need a matching server or function service.

Temporary public tests from your local machine:

```bash
ngrok http 8080
```

Or:

```bash
cloudflared tunnel --url http://localhost:8080
```

This creates a temporary public HTTPS URL that forwards to your local app. Do not use tunnels as a permanent production replacement.

## Recommendation

For local development:

```text
Docker Compose + http://localhost:8080
```

For public tests without your own domain:

```text
Provider URL, Render, Vercel, Netlify, or tunnel
```

For production with your own domain and server:

```text
Docker Compose + Caddy or Nginx/Certbot
```

## SMTP

Contact forms do not send emails from the browser. Credentials live only on the server:

```bash
SMTP_HOST=smtp.example.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_AUTH_METHOD=LOGIN
SMTP_USER=mail-user
SMTP_PASS=mail-password
SMTP_FROM=website@example.org
CONTACT_TO=board@example.org
```

Port `587` uses STARTTLS: `SMTP_SECURE=false` and optionally `SMTP_REQUIRE_TLS=true`. `SMTP_SECURE=true` on port `587` is wrong and typically causes `wrong version number`. Port `465` uses a secure SMTP connection automatically.

Gmail does not accept the normal Google account password for SMTP. `SMTP_PASS` must be a Google App Password. If the app password is copied with spaces, the server strips those spaces for `smtp.gmail.com`.

If your SMTP provider still replies with `AUTH PLAIN` and `535 Authentication credentials invalid` despite correct user/password, set:

```env
SMTP_AUTH_METHOD=LOGIN
```

Allowed values are `LOGIN`, `PLAIN`, and `CRAM-MD5`. Without a value, Nodemailer chooses automatically.

Test SMTP access in isolation:

```bash
npm run smtp:check
```

## CAPTCHA

No CAPTCHA is shown or verified when no provider config exists. In production, if SMTP contact mail is configured, no-CAPTCHA mode is allowed only when you deliberately set:

```env
CAPTCHA_PROVIDER=none
CONTACT_ALLOW_WITHOUT_CAPTCHA=1
```

Use that opt-out only when another layer, such as a CDN/WAF rule or host-level abuse protection, provides equivalent form protection.

hCaptcha mode:

```env
CAPTCHA_PROVIDER=hcaptcha
HCAPTCHA_SITE_KEY=your-public-site-key
HCAPTCHA_SECRET=your-private-secret
```

mCaptcha mode:

```env
CAPTCHA_PROVIDER=mcaptcha
MCAPTCHA_VERIFY_URL=https://captcha.example.org/api/v1/pow/siteverify
MCAPTCHA_SITE_KEY=your-public-site-key
MCAPTCHA_SECRET=your-private-secret
MCAPTCHA_WIDGET_URL=https://captcha.example.org/widget/site
MCAPTCHA_SCRIPT_URL=
```

If `CAPTCHA_PROVIDER` is unset, the server auto-selects `none`, `hcaptcha`, or `mcaptcha` only when the config is unambiguous. If both hCaptcha and mCaptcha secrets are present, set the provider explicitly.

For Node/Docker deployments, keep CAPTCHA configuration only in `.env`. The server injects the public browser config into `site*.json` and `pages*.json` at request time, so you do not need CAPTCHA entries in local JSON.

For static-only hosting, there is no server env at runtime. In that case, set browser-visible config in ignored JSON:

- Contact form: `captcha` in `public/data/site.local.json`
- Membership form: `membership.form.captcha` in `public/data/pages.local.json`

Site keys and widget URLs are browser configuration. Provider secrets stay only in the server environment. Secrets must never be written to JSON or frontend JavaScript.

Troubleshooting:

- Ambiguous config: if both `HCAPTCHA_SECRET` and any `MCAPTCHA_*` provider config are set, also set `CAPTCHA_PROVIDER=hcaptcha` or `CAPTCHA_PROVIDER=mcaptcha`.
- Missing token: when a provider is active, the browser must submit `h-captcha-response` for hCaptcha or `mcaptcha__token` for mCaptcha. Do not rely on client-side widget state alone.
- Bad verify URL: `MCAPTCHA_VERIFY_URL` must be the full self-hosted siteverify endpoint, usually ending in `/api/v1/pow/siteverify`.
- Widget blocked by CSP: for static hosting with mCaptcha, add the mCaptcha script origin to `script-src`, the widget origin to `frame-src`, and the widget/verify origins to `connect-src`.
- Production no-CAPTCHA failure: set `CONTACT_ALLOW_WITHOUT_CAPTCHA=1` only if you intentionally run without provider verification and have equivalent upstream protection.

## Instagram

The website requests `/api/instagram-feed` first. The Node server also serves `/.netlify/functions/instagram-feed` through the same live-feed handler so static/Netlify-compatible deployments keep working. No Instagram credentials are required. If Instagram is unreachable, the browser uses `public/data/instagram-feed.local.json` as fallback. Details: [`instagram.md`](instagram.md).
