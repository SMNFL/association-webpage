#!/usr/bin/env bash
# Keeps the STRATO AAAA record pointed at this Mac's stable ("secured") IPv6 address.
# The ISP can change the IPv6 prefix at any time; without this the site silently goes offline.
# Only for DIRECT hosting with DNS at STRATO. Not needed with Cloudflare Tunnel (DNS at Cloudflare,
# the tunnel record never changes); see docs/cloudflare-tunnel.md.
#
# Usage:  scripts/strato-dyndns.sh [path/to/.env.dyndns]
# Config (default: .env.dyndns in the repo root, never commit it):
#   DYNDNS_HOSTS=example.org,www.example.org   # hosts to update (comma-separated)
#   STRATO_DYNDNS_USER=example.org             # STRATO DynDNS login (the domain)
#   STRATO_DYNDNS_PASSWORD=...                 # DynDNS password from the STRATO customer area
#   DYNDNS_INTERFACE=en0                       # optional, network interface to read the address from
#
# Exit codes: 0 updated or unchanged, 1 configuration/address error, 2 STRATO rejected the update.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="${1:-$ROOT/.env.dyndns}"
UPDATE_URL="https://dyndns.strato.com/nic/update"

log() { printf '%s strato-dyndns: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

for required in DYNDNS_HOSTS STRATO_DYNDNS_USER STRATO_DYNDNS_PASSWORD; do
  if [[ -z "${!required:-}" ]]; then
    log "missing $required (set it in $CONFIG_FILE)"
    exit 1
  fi
done
INTERFACE="${DYNDNS_INTERFACE:-en0}"
FIRST_HOST="${DYNDNS_HOSTS%%,*}"

# macOS marks the stable SLAAC address "secured"; temporary privacy addresses rotate daily.
current_ipv6="$(ifconfig "$INTERFACE" 2>/dev/null | awk '/inet6 / && /secured/ && $2 !~ /^fe80/ { print $2; exit }')"
if [[ -z "$current_ipv6" ]]; then
  log "no stable global IPv6 address on $INTERFACE"
  exit 1
fi

# A failed lookup (DNS timeout) must not abort under `set -e`; an empty result just forces an update.
published_ipv6="$(dig +short AAAA "$FIRST_HOST" 2>/dev/null | tail -1 || true)"
if [[ "$published_ipv6" == "$current_ipv6" ]]; then
  log "unchanged ($current_ipv6)"
  exit 0
fi

# Escapes \ and " for a double-quoted curl config value.
curl_config_quote() {
  local value="${1//\\/\\\\}"
  printf '%s' "${value//\"/\\\"}"
}

# Credentials go through stdin so they never appear in the process list.
credentials="$(curl_config_quote "$STRATO_DYNDNS_USER:$STRATO_DYNDNS_PASSWORD")"
if ! response="$(printf 'user = "%s"\n' "$credentials" \
  | curl --silent --show-error --max-time 30 --config - \
    --get --data-urlencode "hostname=$DYNDNS_HOSTS" --data-urlencode "myip=$current_ipv6" \
    "$UPDATE_URL" 2>&1)"; then
  log "request to STRATO failed: $response"
  exit 2
fi

case "$response" in
  good*|nochg*)
    log "updated $DYNDNS_HOSTS: ${published_ipv6:-none} -> $current_ipv6 ($response)"
    ;;
  *)
    log "update rejected: $response"
    exit 2
    ;;
esac
