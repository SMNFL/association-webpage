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

Behind a host reverse proxy (Caddy/Nginx on the same machine) set `TRUST_PROXY=private` for the Docker container: Docker's port mapping delivers requests from the bridge gateway, not from `127.0.0.1`, so `loopback` would make every visitor share one IP for rate limits.

After changing code, dependencies, the `Dockerfile` or `.env`, rebuild so the container picks it up:

```bash
docker compose up -d --build website
```

The image is built in two stages: compilers needed for the Instagram helper's Python dependency stay in the build stage, and `curl_cffi` is pinned. Full-resolution `assets/images/**/original/` folders, `.editor-backups/` and `.image-backups/` are excluded from the image.

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

Copy the reference config [`deploy/Caddyfile`](../deploy/Caddyfile) to `/etc/caddy/Caddyfile` (Homebrew on macOS: `/opt/homebrew/etc/Caddyfile`) and replace `example.org`:

```caddy
example.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}

www.example.org {
	redir https://example.org{uri} permanent
}
```

`encode` compresses HTML, CSS, JS and JSON. The `www` block redirects to one canonical host; keep it in sync with `SITE_URL`.

Validate and reload:

```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

On macOS with Homebrew, run Caddy as exactly one service. If it was ever started with `sudo`, a root instance keeps ports 80/443 with its old config and `caddy reload` only updates the user instance. Check and fix:

```bash
ps -axo pid,user,command | grep "[c]addy run"
```

```bash
brew services stop caddy
```

```bash
sudo brew services restart caddy
```

Verify compression after a reload:

```bash
curl -sI -H "Accept-Encoding: gzip" https://example.org/styles/main.css | grep -i content-encoding
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

Set `TRUST_PROXY=loopback` when Node runs directly on the host behind Caddy or Nginx. Set `TRUST_PROXY=private` when Node runs in Docker behind a host reverse proxy (the Compose setup above) or when the proxy is on a trusted private network. Leave `TRUST_PROXY=false` when the Node app is not behind a proxy. The app intentionally rejects broad proxy trust values. Details: [`SECURITY.md`](SECURITY.md#production).

## Site-Specific Environment

Set these in `.env` in addition to SMTP and CAPTCHA:

```env
# Public base URL: canonical links, sitemap.xml and the robots.txt Sitemap line.
SITE_URL=https://example.org
# Instagram account for the homepage feed (overrides instagram.username in site config).
INSTAGRAM_USERNAME=example
# Number of editor backup snapshots to keep (default 50).
EDITOR_BACKUP_KEEP=50
```

Without `SITE_URL` the site still works, but `/sitemap.xml` returns 404 and pages have no canonical link.

## Home Hosting With Dynamic IPv6 (DynDNS)

Residential IPv6 prefixes change. When they do, the AAAA record points to a dead address and the site is offline until DNS is updated. Point the record at the Mac's stable ("secured") address and keep it current with [`scripts/strato-dyndns.sh`](../scripts/strato-dyndns.sh):

1. In the STRATO customer area enable DynDNS for the domain and set a DynDNS password.
2. Create `.env.dyndns` in the repository root (ignored by Git and Docker, never commit it):

   ```env
   DYNDNS_HOSTS=example.org,www.example.org
   STRATO_DYNDNS_USER=example.org
   STRATO_DYNDNS_PASSWORD=your-dyndns-password
   DYNDNS_INTERFACE=en0
   ```

3. Run it once by hand. It prints `unchanged` when DNS is already correct and only calls STRATO when the address differs:

   ```bash
   chmod 600 .env.dyndns
   ```

   ```bash
   scripts/strato-dyndns.sh
   ```

4. Schedule it every 5 minutes with a LaunchAgent at `~/Library/LaunchAgents/de.example.dyndns.plist` (adjust the path):

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>Label</key><string>de.example.dyndns</string>
     <key>ProgramArguments</key>
     <array><string>/path/to/repo/scripts/strato-dyndns.sh</string></array>
     <key>StartInterval</key><integer>300</integer>
     <key>RunAtLoad</key><true/>
     <key>StandardOutPath</key><string>/tmp/dyndns.log</string>
     <key>StandardErrorPath</key><string>/tmp/dyndns.log</string>
   </dict>
   </plist>
   ```

   ```bash
   launchctl load ~/Library/LaunchAgents/de.example.dyndns.plist
   ```

The router's IPv6 host exposure for TCP 80/443 must target the same device; most routers follow the device when the prefix changes.

### IPv4 Visitors

An AAAA-only domain is unreachable for IPv4-only networks (some mobile, hotel and corporate networks). Options, from least to most change:

- Ask the ISP for Dual-Stack (a real public IPv4), then add an A record and forward TCP 80/443.
- **Recommended:** Cloudflare Tunnel (free): no open ports, IPv4 + IPv6, works behind DS-Lite and follows prefix changes automatically. It runs as the optional `cloudflared` Compose service (`docker compose --profile tunnel up -d --build`). Setup, DNS migration and security notes: [`cloudflare-tunnel.md`](cloudflare-tunnel.md).
- Use a small VPS with a public IPv4 as reverse proxy to the home server over IPv6 or a VPN.

Do not expose the editor through this public reverse proxy. Start it only locally with `npm run editor` and use `http://127.0.0.1:8081/editor/`.

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

This creates a temporary public HTTPS URL that forwards to your local app, useful for quick tests. For a permanent production setup with your own domain, use a named Cloudflare Tunnel as described in [`cloudflare-tunnel.md`](cloudflare-tunnel.md).

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
