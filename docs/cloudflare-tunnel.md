# Cloudflare Tunnel

Cloudflare Tunnel publishes the website without a public IPv4 address, router port forwarding or a static IP. A small `cloudflared` container opens an **outbound** encrypted connection to Cloudflare; visitors connect to Cloudflare over IPv4 or IPv6, and Cloudflare forwards their requests through that connection. This is the recommended setup for home hosting behind DS-Lite (no public IPv4) or a changing IPv6 prefix.

Everything here uses the Cloudflare **Free** plan.

## Architecture

```text
Visitor (IPv4 or IPv6)
  ↓ HTTPS (Cloudflare edge certificate)
Cloudflare edge: TLS termination, compression, www redirect
  ↓ encrypted tunnel, opened outbound by cloudflared (no inbound ports)
cloudflared container (Compose profile "tunnel", network "edge" only)
  ↓ HTTP inside the isolated Docker network "edge"
website container :8080
```

What stays the same:

- `docker compose up -d --build website` still starts only the website. The tunnel is opt-in via `--profile tunnel`.
- The website is still published on `127.0.0.1:8080` for local checks and an optional host reverse proxy (Caddy). Nothing listens on the LAN or the internet.
- The editor and mCaptcha are not on the `edge` network; `cloudflared` cannot reach them.

What changes after the switch:

- Public traffic no longer reaches Caddy or the router. Port exposure and DynDNS become unnecessary (see [Step 8](#step-8-retire-the-direct-ipv6-path)).
- Cloudflare provides compression, the www redirect and the public TLS certificate.

## Prerequisites

- A free Cloudflare account with two-factor authentication enabled.
- Access to the domain registrar (STRATO) to change nameservers.
- Docker Desktop running the website as described in [`SELF_HOSTING.md`](SELF_HOSTING.md).
- `TRUST_PROXY=private` in `.env` (cloudflared reaches the app from a private Docker address and forwards the visitor IP in `X-Forwarded-For`).

## Step 1: Add the domain to Cloudflare (manual, dashboard)

1. Cloudflare dashboard → **Add a domain** → enter the apex domain (e.g. `example.org`) → select the **Free** plan.
2. Cloudflare imports the existing DNS records. **Compare them with the registrar's DNS before continuing.** Missing records break other services:
   - `MX`, `TXT` (SPF, DKIM, DMARC, domain verification), `autoconfig`/`autodiscover` for email hosted at the registrar.
   - Any other subdomains you use.
3. Delete the imported `A`/`AAAA` records for the apex and `www` (they point at the home connection). The tunnel creates its own records in Step 4, and Cloudflare refuses to create a hostname that already has a record.
4. Note the two nameservers Cloudflare assigns (e.g. `xxx.ns.cloudflare.com`).

## Step 2: Switch the nameservers at the registrar (manual, requires authorization)

This moves DNS authority for the whole domain to Cloudflare. Plan it for a quiet time.

1. If DNSSEC is enabled at the registrar, **disable it first** and wait for it to expire (otherwise the domain stops resolving). Re-enable it later in Cloudflare (DNS → Settings → DNSSEC) and enter the DS record at the registrar.
2. STRATO: customer login → **Domains → Domainverwaltung** → domain → **Nameserver** → use your own nameservers → enter the two Cloudflare nameservers. Menu names can differ slightly per package.
3. Wait until Cloudflare shows the domain as **Active** (minutes to 24 hours). Check:

   ```bash
   dig +short NS example.org
   ```

Until the tunnel is running (Step 6), the website is unreachable through Cloudflare, so do Steps 3–6 right after activation, or prepare them before switching the nameservers.

## Step 3: Create the tunnel and store the token (manual, dashboard)

1. Cloudflare dashboard → **Zero Trust** (free plan; choose the Free tier if asked) → **Networks → Tunnels** → **Create a tunnel** → **Cloudflared**.
2. Name it, e.g. `website`.
3. Under "Install and run a connector", choose **Docker**. The shown command ends with `--token eyJ...`. Copy **only the token** (the long `eyJ...` string). Do not run the shown command.
4. Store it as a Docker secret file (owner-only, never committed; `secrets/` is ignored by Git, Docker builds and the release check). Copy the token to the clipboard, then:

   ```bash
   mkdir -p secrets && chmod 700 secrets
   ```

   ```bash
   (umask 077 && pbpaste | tr -d '[:space:]' > secrets/cloudflare-tunnel-token)
   ```

   ```bash
   wc -c secrets/cloudflare-tunnel-token
   ```

   The token is a few hundred characters long. Using the clipboard keeps it out of your shell history.

   On Linux hosts the container user (`65532`) must be able to read the file: `sudo chown 65532:65532 secrets/cloudflare-tunnel-token`. Docker Desktop on macOS needs no change.

## Step 4: Route the hostnames (manual, dashboard)

In the tunnel → **Public Hostname** (or **Published application routes**) → add:

| Subdomain | Domain | Type | URL |
|---|---|---|---|
| *(empty)* | `example.org` | HTTP | `website:8080` |
| `www` | `example.org` | HTTP | `website:8080` |

- `website` is the Compose service name, resolved inside the `edge` network. Do **not** use `localhost` or `127.0.0.1`: inside the `cloudflared` container that is the container itself.
- Use type **HTTP**. The hop from `cloudflared` to the website stays inside the isolated Docker network; TLS to the outside is handled by the tunnel.
- Leave "Additional application settings" at their defaults. Do not enable "No TLS Verify" or HTTP Host header overrides; the app checks that `Origin` matches `Host` for form submissions.
- Never add routes to the editor (`editor`, port 8081) or mCaptcha. They are not on the `edge` network and must stay local-only.
- Requests for any other hostname hit the tunnel's catch-all rule and get a 404.

Cloudflare creates proxied `CNAME` records pointing to `<tunnel-id>.cfargotunnel.com`.

## Step 5: Cloudflare settings (manual, dashboard, all free)

- **www → apex redirect:** Rules → Redirect Rules → template **Redirect from WWW to root** (301, preserve path and query). Keeps one canonical host matching `SITE_URL`.
- **SSL/TLS → Edge Certificates:** Always Use HTTPS **on**, Minimum TLS Version **1.2**, Automatic HTTPS Rewrites **on**. HSTS is already sent by the app in production; you do not need to enable it in Cloudflare.
- **SSL/TLS → Overview:** encryption mode does not affect tunnel traffic; leave it at **Full**.
- Compression (gzip/Brotli/zstd) is automatic.
- Optional: Security → Bots → Bot Fight Mode. Test the contact form afterwards; hCaptcha still runs as before.

Leave caching at the defaults. Cloudflare caches static files by extension and respects the app's `Cache-Control` headers (HTML, data and JS revalidate; media and fonts for 7 days). It does not cache `/api/*` JSON or form posts.

## Step 6: Start and verify

`.env` must contain `TRUST_PROXY=private` and `SITE_URL=https://example.org` (unchanged). Then:

```bash
docker compose --profile tunnel up -d --build
```

This rebuilds and restarts `website` with its health check and starts `cloudflared` once the website is healthy. Check:

```bash
docker compose --profile tunnel ps
```

Both services should show `healthy`.

```bash
docker compose logs --tail 20 cloudflared
```

Look for four lines with `Registered tunnel connection`. In the dashboard the tunnel shows **Healthy**.

From outside, test both IP families:

```bash
curl -4 -sI https://example.org/ | grep -iE "^HTTP|server|cf-ray"
```

```bash
curl -6 -sI https://example.org/ | grep -iE "^HTTP|server|cf-ray"
```

Expect `HTTP/2 200`, `server: cloudflare` and a `cf-ray` header. Also check:

```bash
curl -sI https://www.example.org/pages/privacy.html | grep -iE "^HTTP|location"
```

```bash
curl -sI -H "Accept-Encoding: gzip" https://example.org/styles/main.css | grep -i content-encoding
```

Finally submit the contact form once from a browser. The server log should show the visitor's real IP in security events, not a Docker address.

Later restarts and deploys use the same profile, so the tunnel comes back with the website:

```bash
docker compose --profile tunnel up -d --build
```

## Step 7: Keep it running

- `restart: unless-stopped` restarts both containers after crashes and Docker Desktop restarts. Enable Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**, so the site comes back after a Mac reboot (Docker Desktop on macOS starts only after login).
- Update `cloudflared` deliberately. The image is pinned by tag **and** digest in `compose.yaml`; update both together, then restart:

  ```bash
  docker buildx imagetools inspect cloudflare/cloudflared:<version> | grep -m1 Digest
  ```

  ```bash
  docker compose --profile tunnel up -d
  ```

  Cloudflare supports connector versions for about a year.
- `docker compose config` prints the resolved `.env` values, including SMTP, CAPTCHA and editor secrets, in plain text. Do not paste its output into issues or chats; use `docker compose config --quiet` to validate.

## Step 8: Retire the direct IPv6 path

After the tunnel works from IPv4 and IPv6 for a few days:

1. Remove the router's IPv6 host exposure for TCP 80/443. Nothing needs inbound connections anymore, which closes the home network to direct scans.
2. Stop the public Caddy site. Its Let's Encrypt renewals will fail anyway, because the domain now resolves to Cloudflare:

   ```bash
   sudo brew services stop caddy
   ```

   Keep `deploy/Caddyfile` for a rollback or local use.
3. Stop the DynDNS updater (`scripts/strato-dyndns.sh`, LaunchAgent if installed). The registrar's DNS is no longer authoritative.

## Rollback

- **Quick:** in Cloudflare DNS, replace the tunnel CNAMEs for apex and `www` with an `AAAA` record to the Mac's stable IPv6, **DNS only** (grey cloud). Restore router exposure and start Caddy. IPv4-only visitors lose access again.
- **Full:** set the registrar's nameservers back to the defaults and restore the DNS records there.
- `docker compose stop cloudflared` stops the tunnel without touching the website.

## Security Considerations

- **TLS termination at Cloudflare.** Visitors' HTTPS ends at Cloudflare's edge, where requests are decrypted, inspected (WAF, caching, compression) and re-encrypted into the tunnel. Cloudflare can therefore read all traffic, including contact messages and membership applications with IBAN/BIC. Treat Cloudflare as a data processor: accept Cloudflare's data processing addendum (self-serve, free) and name Cloudflare in the privacy policy (purpose: hosting/CDN/security, data transfer to the US under the EU-US Data Privacy Framework).
- **Tunnel transport.** `cloudflared` authenticates with the token and connects outbound over TLS (QUIC or HTTP/2). There are no inbound ports, so the router and the Mac accept no connections from the internet.
- **Last hop.** `cloudflared` talks plain HTTP to `website:8080` inside the `edge` Docker network. Only these two containers are on that network; the hop never leaves the Mac.
- **The token is the tunnel.** Anyone with it can run a connector that receives your site's traffic. It lives only in `secrets/cloudflare-tunnel-token` (owner-only, ignored by Git and Docker builds, passed as a Docker secret file, not as an environment variable, so it does not show in `docker inspect`). If it may have leaked: tunnel → **Refresh token** in the dashboard, replace the file, restart `cloudflared`.
- **Least privilege.** `cloudflared` runs as non-root with a read-only filesystem, no Linux capabilities and `no-new-privileges`, publishes no ports, keeps metrics on `127.0.0.1` inside its container, and has auto-update and remote diagnostics disabled. The website also drops all capabilities. The editor runs on its own `editor` network, so neither the tunnel nor the website container can reach it; mCaptcha is not on the `edge` network either. The editor additionally rejects any request with forwarding headers.
- **Real visitor IP.** Cloudflare puts the visitor IP in `X-Forwarded-For`. With `TRUST_PROXY=private` the app trusts only private hops (the `cloudflared` container) and takes the address Cloudflare appended, so a client-supplied `X-Forwarded-For` cannot spoof it. Rate limits and logs stay per visitor.
- **Account security.** Whoever controls the Cloudflare account controls DNS, routes and certificates. Use 2FA and do not share the login.
- **Limitations.** Free plan, no SLA; request bodies are limited to 100 MB (far above the app's limits); WebSockets work but are not used. Availability still depends on the Mac, Docker Desktop and the home connection being up.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `secret "cloudflare_tunnel_token" ... no such file` on start | Create `secrets/cloudflare-tunnel-token` (Step 3). |
| `Provided Tunnel token is not valid` | The file contains more than the token (e.g. the whole install command, quotes). Store only the `eyJ...` string, without whitespace. |
| `cloudflared` stays `starting`/`unhealthy`, logs show connection errors | Outbound UDP 7844 (QUIC) may be blocked; cloudflared falls back to HTTP/2 over TCP 443 automatically. Check `docker compose logs cloudflared`. |
| Cloudflare error 1033 | No connector is running. `docker compose --profile tunnel up -d`, then check logs. |
| 502 Bad Gateway | The route points to the wrong service (e.g. `localhost:8080`). Use `website:8080`. Check `docker compose ps` that `website` is healthy. |
| `cloudflared` never starts, `dependency failed` | The website health check fails: `docker compose logs website`, `curl http://127.0.0.1:8080/healthz`. |
| Contact form: "Request verification failed" (403) | `Origin` and `Host` differ, e.g. a Host header override in the tunnel route, or the form was opened on `www` without the redirect. Remove overrides; enable the www redirect. |
| All visitors share one IP in logs / contact form limited for everyone | `TRUST_PROXY` is not `private`. Fix `.env`, then rebuild `website`. |
| Domain stopped resolving after the nameserver switch | DNSSEC still active at the registrar, or records missing in Cloudflare. Disable DNSSEC at the registrar; compare DNS records (Step 1). |
| Mail stopped working | `MX`/`TXT` records were not imported. Add them in Cloudflare DNS as **DNS only**. |
| Caddy logs certificate renewal errors | Expected after the switch; stop Caddy (Step 8). |
