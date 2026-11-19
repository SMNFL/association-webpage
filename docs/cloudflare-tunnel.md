# Cloudflare Tunnel

The recommended production setup. A `cloudflared` container opens an **outbound** encrypted connection to Cloudflare; visitors connect to Cloudflare over IPv4 or IPv6, and Cloudflare forwards their requests through that connection. No public IPv4, port forwarding, static IP or reverse proxy on the server is needed, so it works behind DS-Lite and with changing IPv6 prefixes. Everything uses the Cloudflare **Free** plan.

## What It Replaces

| Before (direct hosting) | With Cloudflare Tunnel |
|---|---|
| Caddy/Nginx on the host for TLS, compression, redirects | Cloudflare edge (Universal SSL, automatic compression, Redirect Rule, "Always Use HTTPS") |
| Let's Encrypt certificate on the server | Cloudflare edge certificate, renewed by Cloudflare |
| Router port forwarding / IPv6 host exposure for TCP 80/443 | None: the connection is outbound only |
| DNS at the registrar + DynDNS script for changing IPv6 prefixes | DNS at Cloudflare; the tunnel record never changes |
| IPv6-only reachability behind DS-Lite | IPv4 and IPv6 |

`deploy/Caddyfile` and `scripts/strato-dyndns.sh` remain in the repository only for the [direct-hosting alternative](SELF_HOSTING.md#alternative-direct-hosting-with-a-reverse-proxy).

## Architecture

```text
Visitor (IPv4 or IPv6)
  ↓ HTTPS, Cloudflare edge certificate
Cloudflare edge: TLS termination, HTTP→HTTPS, www→apex, compression
  ↓ encrypted tunnel (HTTP/2 over TCP 443), opened outbound by cloudflared
cloudflared container   (Compose profile "tunnel", network "edge" only)
  ↓ plain HTTP inside the isolated Docker network "edge"
website container :8080 (also on 127.0.0.1:8080 for local checks)
```

- `docker compose up -d --build website` still starts only the website; the tunnel is opt-in via `--profile tunnel`.
- The editor runs on its own `editor` network and mCaptcha on `default`; neither is reachable from the tunnel.

## Short Version

For readers who know Cloudflare. Each step is detailed below.

1. Cloudflare: add the domain (Free), recreate **all** DNS records (especially mail) as *DNS only*, delete the old `A`/`AAAA` web records.
2. Registrar: disable DNSSEC, set the two Cloudflare nameservers.
3. Zero Trust → Tunnels → create a tunnel; save **only the token** to `secrets/cloudflare-tunnel-token`.
4. Tunnel routes: `example.org` and `www.example.org` → `http://website:8080`; DNS records become type *Tunnel* (proxied).
5. Dashboard: Redirect Rule www→root, Always Use HTTPS, Minimum TLS 1.2.
6. `TRUST_PROXY=private` in `.env`, then `docker compose --profile tunnel up -d --build`.
7. Retire the direct path: router exposure, Caddy, DynDNS.

## Prerequisites

- A free Cloudflare account with two-factor authentication.
- Access to the domain registrar to change nameservers (STRATO: possible on domain packages with "external nameservers").
- Docker (Docker Desktop on macOS) and the website configured per [`deployment.md`](deployment.md#new-deployment-checklist).
- `.env`: `TRUST_PROXY=private` and `SITE_URL=https://example.org`.

## Step 1: Add The Domain And Copy DNS Records

1. Cloudflare dashboard → **Add a domain** → apex domain → **Free** plan.
2. Cloudflare imports some records automatically, but often not all. Before switching nameservers, list what the registrar serves today and recreate everything that is missing. Ask the current nameserver directly:

   ```bash
   NS=$(dig +short NS example.org | head -1)
   ```

   ```bash
   for n in example.org www.example.org autoconfig.example.org _dmarc.example.org _autodiscover._tcp.example.org; do for t in A AAAA CNAME MX TXT SRV; do dig +short $t $n @$NS | sed "s|^|$n $t |"; done; done
   ```

   DKIM records have provider-specific names (STRATO: `strato-dkim-0001._domainkey` / `strato-dkim-0002._domainkey`); query those too. Typical STRATO mail records:

   | Type | Name | Content |
   |---|---|---|
   | MX | `@` | `smtpin.rzone.de`, priority 5 |
   | TXT | `strato-dkim-000X._domainkey` | `v=DKIM1; k=rsa; p=…` |
   | TXT | `_dmarc` | `v=DMARC1;p=reject;` (with `p=reject`, missing DKIM means rejected mail) |
   | CNAME | `autoconfig` | `autoconfigure.strato.de` |
   | SRV | `_autodiscover._tcp` | `0 100 443 autoconfigure.strato.de` |

   Many records at once: write them as a BIND zone file and use **DNS → Records → Import and Export → Import**, with "Proxy imported DNS records" unchecked.
3. All mail and other non-web records: **DNS only** (grey cloud).
4. Delete the `A`/`AAAA` records for the apex and `www`. They point at the home connection, and the tunnel creates its own records in Step 4. Under DS-Lite an `A` record would point at a shared provider address that is not reachable.
5. Note the two assigned nameservers (e.g. `name1.ns.cloudflare.com`, `name2.ns.cloudflare.com`).

## Step 2: Switch The Nameservers (requires registrar authorization)

This moves DNS authority for the whole domain to Cloudflare. It is not an `NS` record inside the zone; it changes the domain's delegation.

1. If DNSSEC is enabled at the registrar, **disable it first** and wait for it to expire, otherwise the domain stops resolving. Re-enable it later in Cloudflare (DNS → Settings → DNSSEC) and enter the DS record at the registrar.
2. STRATO: **Domains → Domainverwaltung** → domain → **Nameserver** → use your own/external nameservers → enter both Cloudflare nameservers. Menu names vary slightly per package.
3. Wait until the registry delegates to Cloudflare (minutes to a day) and Cloudflare shows the domain as **Active**:

   ```bash
   dig +short NS example.org @a.nic.de
   ```

   Use the registry of your TLD (`a.nic.de` for `.de`); public resolvers may show the old nameservers until their cache expires.

You can verify the new records at Cloudflare before the switch takes effect:

```bash
dig +short MX example.org @<name1>.ns.cloudflare.com
```

## Step 3: Create The Tunnel And Store The Token

1. Cloudflare dashboard → **Zero Trust** (choose the Free tier if asked) → **Networks → Tunnels** → **Create a tunnel** → **Cloudflared** → name it, e.g. `website`.
2. Under "Install and run a connector", choose **Docker**. The page shows a full command:

   ```text
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhIjoi…
   ```

   Do **not** run that command; the Compose service runs the same tunnel pinned, hardened and on the right network. You need only the token, the long string starting with `eyJhIjoi` (about 180+ characters).

   Two other IDs look similar and do **not** work as token:
   - **Tunnel ID**: 36-character UUID, shown in the tunnel list.
   - **Connector ID**: logged by cloudflared as "Generated Connector ID", changes per container.
3. Copy the full command to the clipboard and extract the token into the secret file (keeps it out of shell history):

   ```bash
   mkdir -p secrets && chmod 700 secrets
   ```

   ```bash
   (umask 077 && pbpaste | grep -oE 'eyJ[A-Za-z0-9+/=_-]{50,}' | head -1 | tr -d '\n' > secrets/cloudflare-tunnel-token)
   ```

   Check it (must print `eyJhIjoi` and a length above 150):

   ```bash
   head -c 8 secrets/cloudflare-tunnel-token; echo; wc -c < secrets/cloudflare-tunnel-token
   ```

   Then copy something else to clear the clipboard.

   On Linux hosts the container user (`65532`) must be able to read the file: `sudo chown 65532:65532 secrets/cloudflare-tunnel-token`. Docker Desktop on macOS needs no change.

## Step 4: Route The Hostnames And Point DNS At The Tunnel

1. Tunnel → **Public Hostname** / **Published application routes** → add two routes:

   | Hostname | Service URL |
   |---|---|
   | `example.org` | `http://website:8080` |
   | `www.example.org` | `http://website:8080` |

   - The field needs the full URL including `http://`.
   - Use `website` (the Compose service name), never `localhost` or `127.0.0.1`: inside the `cloudflared` container that is the container itself (Cloudflare returns 502).
   - Use `http`, not `https`: the app speaks plain HTTP inside the isolated network; the tunnel encrypts the outside connection.
   - Leave "Additional application settings" at the defaults. No HTTP Host header override (the contact form checks that `Origin` matches `Host`), no "No TLS Verify".
   - Routes are matched top to bottom. Delete wrong or duplicate routes (row menu ⋯ → Delete) so only these two remain, plus the automatic catch-all `http_status:404`.
   - Never add routes to the editor or mCaptcha.
2. Check **DNS → Records**: apex and `www` must be type **Tunnel** (proxied), linked to your tunnel. Cloudflare creates them only when no record exists for that name. If old `AAAA`/`CNAME` records remain, delete them and save the routes again, or create them by hand:

   | Type | Name | Target | Proxy |
   |---|---|---|---|
   | CNAME | `@` | `<tunnel-id>.cfargotunnel.com` | Proxied |
   | CNAME | `www` | `<tunnel-id>.cfargotunnel.com` | Proxied |

   The tunnel ID (not the connector ID) is in the tunnel list, or in the token:

   ```bash
   base64 -d < secrets/cloudflare-tunnel-token | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).t+".cfargotunnel.com"))'
   ```

   Do both changes in one go; between deleting the old records and adding the tunnel records the site is briefly unreachable.

## Step 5: Cloudflare Settings (Free)

In the dashboard, open the **domain** (not Zero Trust):

- **Rules → Redirect Rules** → template **Redirect from WWW to root** (301, preserve query string).
- **SSL/TLS → Edge Certificates**: **Always Use HTTPS** on, **Minimum TLS Version** 1.2, **Automatic HTTPS Rewrites** on. Settings save immediately. HSTS is already sent by the app.
- **SSL/TLS → Overview**: the encryption mode does not affect tunnel traffic; leave it at *Full*.
- Compression is automatic. Caching defaults are fine: Cloudflare respects the app's `Cache-Control` and does not cache `/api/*` or form posts.

## Step 6: Start And Verify

```bash
docker compose --profile tunnel up -d --build
```

This rebuilds and restarts `website` with its health check and starts `cloudflared` once the website is healthy.

```bash
docker compose --profile tunnel ps
```

Both services must be `healthy`.

```bash
docker compose logs --tail 30 cloudflared | grep -E "Registered tunnel connection|Updated to new configuration|ERR"
```

Expect four `Registered tunnel connection` lines and an `Updated to new configuration` line listing your two routes with `http://website:8080`.

From outside, pin the request to a Cloudflare edge IP. Your router's DNS cache may still return old records for a while; check what Cloudflare serves with `dig +short A example.org @<name1>.ns.cloudflare.com`:

```bash
curl -sI --resolve example.org:443:188.114.96.3 https://example.org/ | grep -iE "^HTTP|^server|^via"
```

Expect `HTTP/2 200` and `server: cloudflare`, and **no** `via: … Caddy` (that would mean traffic still bypasses the tunnel). Also check the redirects:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --resolve example.org:80:188.114.96.3 http://example.org/
```

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --resolve www.example.org:443:188.114.96.3 https://www.example.org/
```

Both must return `301` (to `https://` and to the apex). Finally submit the contact form once: the security log (`docker compose logs website`) must show the visitor's public IP, not a Docker address.

To flush DNS caches on the Mac after the switch:

```bash
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

## Step 7: Operation

- Deploy every change with `docker compose --profile tunnel up -d --build`; plain `docker compose up` without the profile would not keep the tunnel managed.
- `restart: unless-stopped` restarts both containers after crashes. Enable Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**, so the site comes back after a reboot (Docker Desktop on macOS starts only after login).
- Update `cloudflared` deliberately. The image is pinned by tag and digest in `compose.yaml`; update both together:

  ```bash
  docker buildx imagetools inspect cloudflare/cloudflared:<version> | grep -m1 Digest
  ```

  Cloudflare supports connector versions for about a year.
- Stop only the tunnel: `docker compose stop cloudflared`. The website keeps running locally.
- Monitoring (free): Cloudflare dashboard → **Notifications** → **Add** → **Tunnel Health Alert** → select the tunnel → enter an email address. You get a mail when the tunnel becomes unhealthy or down. Docker does not restart an `unhealthy` container on its own, so this alert is the signal to recreate it (`docker compose --profile tunnel up -d cloudflared`). Status at a glance: Zero Trust → Networks → Tunnels (Healthy/Down), locally `docker compose --profile tunnel ps`.
- `docker compose config` prints resolved `.env` secrets in plain text. Validate with `docker compose config --quiet` and do not share its output.

## Step 8: Retire The Direct Path

After the tunnel has worked over IPv4 and IPv6 for a few days:

1. Router: remove the IPv6 host exposure / port forwarding for TCP 80/443. Nothing needs inbound connections anymore.
2. Stop Caddy; its Let's Encrypt renewals fail now that the domain resolves to Cloudflare:

   ```bash
   sudo brew services stop caddy
   ```

3. Stop the DynDNS updater (unload its LaunchAgent if installed). The registrar's DNS is no longer authoritative, so updates there have no effect.
4. Privacy policy: name Cloudflare as processor (see [Security Considerations](#security-considerations)).

## Rollback

- **Quick:** in Cloudflare DNS replace the two Tunnel records with an `AAAA` record to the server's stable IPv6, **DNS only**, restore the router exposure and start Caddy. IPv4-only visitors lose access again.
- **Full:** set the registrar's default nameservers again and recreate the records there.

## Security Considerations

- **TLS terminates at Cloudflare.** Visitors' HTTPS ends at Cloudflare's edge, where requests are decrypted, processed and re-encrypted into the tunnel. Cloudflare can read all traffic, including contact messages and membership applications with IBAN/BIC. Treat Cloudflare as a data processor: accept Cloudflare's self-serve data processing addendum and name Cloudflare in the privacy policy (hosting/CDN/security; US transfer under the EU-US Data Privacy Framework).
- **No inbound ports.** `cloudflared` authenticates with the token and connects outbound over TLS (HTTP/2 over TCP 443; QUIC over UDP is disabled because it stalls behind carrier-grade NAT). The router and the server accept no connections from the internet.
- **Last hop.** `cloudflared` → `website:8080` is plain HTTP inside the `edge` Docker network, which contains only these two containers and never leaves the host.
- **The token is the tunnel.** Anyone with it can run a connector that receives the site's traffic. It lives only in `secrets/cloudflare-tunnel-token` (owner-only; ignored by Git, Docker builds and the release check; mounted as a Docker secret, not an environment variable, so it does not appear in `docker inspect`). If it may have leaked: tunnel → **Refresh token**, replace the file, `docker compose --profile tunnel up -d`.
- **Least privilege.** `cloudflared` runs as non-root with a read-only filesystem, no Linux capabilities, `no-new-privileges`, no published ports, metrics on `127.0.0.1` inside the container, and auto-update and remote diagnostics disabled. The website also drops all capabilities. The editor is on its own network and rejects requests with forwarding headers.
- **Real visitor IP.** Cloudflare appends the visitor IP to `X-Forwarded-For`. With `TRUST_PROXY=private` the app trusts only the private `cloudflared` hop and uses the address Cloudflare appended; a client-supplied `X-Forwarded-For` cannot spoof it. Rate limits and logs stay per visitor.
- **Account security.** Whoever controls the Cloudflare account controls DNS, routes and certificates: use 2FA and do not share the login.
- **Limits.** Free plan without SLA; request bodies up to 100 MB (far above the app's limits). Availability still depends on the host, Docker and the home connection.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `secret "cloudflare_tunnel_token" … no such file` | Create `secrets/cloudflare-tunnel-token` (Step 3). |
| `Provided Tunnel token is not valid`, container restarting | The file holds the tunnel ID, connector ID or the whole command. Store only the `eyJhIjoi…` string (Step 3). |
| Log: `No ingress rules were defined` | Routes are missing (Step 4). They reach the running connector automatically. |
| Responses still contain `via: … Caddy` | DNS still points at the old origin: replace the apex/`www` records with Tunnel records (Step 4). |
| 502 Bad Gateway | Route target is wrong (`localhost`, `https://`). Use `http://website:8080`; check `website` is healthy. |
| "Invalid service URL format" in the dashboard | Enter the full URL: `http://website:8080`. |
| Cloudflare error 1033 | No connector running: `docker compose --profile tunnel up -d`, check logs. |
| Site returns 530/1033, `cloudflared` `unhealthy`, log: `failed to dial to edge with quic` | UDP (QUIC) stalls through carrier-grade NAT and cloudflared does not fall back to TCP once QUIC was used. `compose.yaml` therefore sets `--protocol http2` (TCP 443). Recreate the container: `docker compose --profile tunnel up -d cloudflared`. Docker does not restart `unhealthy` containers by itself. |
| `cloudflared` never starts, `dependency failed` | Website health check fails: `docker compose logs website`, `curl http://127.0.0.1:8080/healthz`. |
| Contact form "Request verification failed" (403) | `Origin` and `Host` differ: remove Host header overrides in the route; make sure the www redirect is active. |
| All visitors share one IP in logs | `TRUST_PROXY` is not `private`; fix `.env` and redeploy. |
| `http://` serves the page unencrypted | Enable **Always Use HTTPS** (Step 5). |
| `www` serves the page instead of redirecting | Add the Redirect Rule (Step 5). |
| Domain stops resolving after the nameserver switch | DNSSEC still active at the registrar, or records missing in Cloudflare (Steps 1–2). |
| Mail stops working | MX, DKIM, DMARC or autodiscover records missing in Cloudflare; add them as DNS only (Step 1). |
| Local tests still hit the old address | Router/Mac DNS cache; flush the Mac cache, wait for the router TTL, or test with `--resolve` (Step 6). |
| Caddy logs certificate renewal errors | Expected after the switch; stop Caddy (Step 8). |
