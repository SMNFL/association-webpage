#!/usr/bin/env bash
# Shrinks oversized published images in public/assets/images (never the */original/* archive copies).
#
# Usage:
#   scripts/optimize-images.sh            # dry run: list what would change
#   scripts/optimize-images.sh --apply    # back up, then rewrite oversized images in place
#
# Tunables (env): MIN_KB=300 MAX_EDGE=1600 JPEG_QUALITY=82
# Requires ImageMagick 7 (`magick`). A rewritten file is kept only when it is actually smaller.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_DIR="$ROOT/public/assets/images"
MIN_KB="${MIN_KB:-300}"
MAX_EDGE="${MAX_EDGE:-1600}"
JPEG_QUALITY="${JPEG_QUALITY:-82}"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 7 ('magick') is required: brew install imagemagick" >&2
  exit 1
fi
[[ -d "$IMAGE_DIR" ]] || { echo "No image directory at $IMAGE_DIR" >&2; exit 1; }

BACKUP_DIR="$ROOT/.image-backups/$(date -u +%Y-%m-%dT%H-%M-%SZ)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

changed=0
saved_bytes=0
while IFS= read -r -d '' file; do
  before=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file")
  relative="${file#"$ROOT"/}"
  if [[ $APPLY -eq 0 ]]; then
    printf '%8d KB  %s\n' $((before / 1024)) "$relative"
    changed=$((changed + 1))
    continue
  fi

  candidate="$TMP_DIR/$(basename "$file")"
  magick "$file" -auto-orient -strip -resize "${MAX_EDGE}x${MAX_EDGE}>" -quality "$JPEG_QUALITY" "$candidate"
  after=$(stat -f%z "$candidate" 2>/dev/null || stat -c%s "$candidate")
  if (( after < before )); then
    mkdir -p "$BACKUP_DIR/$(dirname "$relative")"
    cp -p "$file" "$BACKUP_DIR/$relative"
    mv "$candidate" "$file"
    changed=$((changed + 1))
    saved_bytes=$((saved_bytes + before - after))
    printf '%8d KB -> %6d KB  %s\n' $((before / 1024)) $((after / 1024)) "$relative"
  fi
done < <(find "$IMAGE_DIR" -path '*/original/*' -prune -o -type f -size +"${MIN_KB}"k \
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) -print0)

if [[ $APPLY -eq 0 ]]; then
  echo "Dry run: $changed image(s) above ${MIN_KB} KB. Re-run with --apply to optimize them."
else
  echo "Optimized $changed image(s), saved $((saved_bytes / 1024)) KB. Backups: ${BACKUP_DIR#"$ROOT"/}"
fi
