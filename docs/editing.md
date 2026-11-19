# Editing Text And Images

## Text

Do not edit website text in `public/index.html`. HTML should stay structural.

Generic defaults live in `public/data/site.default.json`.

Local site-specific values live in `public/data/site.local.json`, which is ignored by Git.

Use `public/data/site.local.example.json` as the starting point for a local override.

Subpage content uses:

- `public/data/pages.default.json`
- `public/data/pages.local.json`

The most common values are:

- `name`
- `description`
- `email`
- `address`
- `instagram.profileUrl`
- `contactSection.instagramLabel`
- `contactSection.socialLinks`
- `links.membership`
- `links.booking`
- `address.mapsUrl`
- `address.mapsEmbedUrl`

## Google Maps Location

The contact section uses these values:

```json
"mapsUrl": "https://maps.google.com/",
"mapsEmbedUrl": "https://www.google.com/maps?q=Example%20Location&output=embed"
```

`mapsUrl` is used for clickable buttons and cards. `mapsEmbedUrl` is used for the embedded map preview.

## Membership Form

The membership page is `public/pages/membership.html`.

The homepage CTA reads `links.membership` from merged site data. For a local site this lives in `public/data/site.local.json`:

```json
"membership": "pages/membership.html"
```

Form processing is described in `docs/membership.md`.

## Images

Editable image references are in merged site data and canonical event data:

- `public/data/site.default.json`
- `public/data/site.local.json`
- `public/data/events.default.json`
- `public/data/events.content.json`

For normal usage, run `npm run security:setup-editor` once, start `npm run editor`, open `http://127.0.0.1:8081/editor/`, log in, and use the Media section. The media list can copy a path, apply an image as the selected event cover, or append it to the selected event gallery.

Deployment-specific media directories are ignored by Git. Uploads stay available in the local working copy and are not automatically published with the reusable repository. Use a private deployment artifact or a separate private media pipeline for a real site.

Event archives keep a full-resolution copy under `.../original/` and the published copy under `.../display/`. Pages reference only `display/` images; `original/` folders are never served publicly and are left out of the Docker image. Keep published images small (ideally under 300 KB): run `scripts/optimize-images.sh` for a dry run and `scripts/optimize-images.sh --apply` to shrink oversized images (backups go to `.image-backups/`).

Each editor save first copies the previous file into `.editor-backups/<timestamp>/`. Only the newest 50 snapshots are kept; set `EDITOR_BACKUP_KEEP` in `.env` to change that.

## Editor Navigation

The preview menu includes the homepage, regular subpages, culture detail pages and every generated event page. Use `Preview page` inside an event to open that event directly in the center preview.

The Pages list is grouped by website element instead of raw JSON values. Related values are edited together. For example, a navigation item or button shows its visible label and its `href` in one inspector.

Use the page filter to switch between the homepage, document pages and culture detail pages. The section navigation narrows the list further. `All pages` is available for a deliberate global search. Each item shows its page, section and type such as heading, text, link, image, gallery or metadata.

The Media section is grouped by purpose and event archive folder. Event archive folders are sorted newest first and split into web gallery files and original files. A selected event folder is prioritized when applicable. Use the folder filter to show `All folders`, `Homepage gallery`, or one event folder, matching the focused Pages workflow.

Each media card always shows four separate gallery actions: `Add to event gallery`, `Add to main gallery`, `Remove from event gallery`, and `Remove from main gallery`. Actions that do not apply are disabled. `Add to main gallery` prompts for alternative text and stores a reference in `site.images.gallery`. For event galleries, first choose the visible `Event gallery target`. Remove actions require confirmation and never delete the image file.

## Theme Settings

The Settings page edits safe, reusable public-site tokens stored under `site.theme` in `public/data/site.local.json`.

- Theme colors and browser theme color
- Container width, corner style and spacing density
- Supported typography presets
- Ambient color and background-grid toggles

Edits update the center preview immediately. Use `Save settings` to persist them, `Discard changes` to restore the saved theme, or `Download JSON` to export the current settings. Raw CSS is intentionally not supported.

To replace an image manually:

1. Put the new image in `public/assets/images/`.
2. Use a clear filename, for example `hero-community-room.jpg`.
3. Update the related JSON value, for example:

```json
"hero": "assets/images/hero-community-room.jpg"
```

## Current Image State

Event archive images are stored locally under `public/assets/images/eventsArchive/`. Some original source URLs are preserved inside event metadata as provenance; public rendering should use local `assets/images/...` display images whenever available.

## Events

Events are edited in the local editor, not in HTML. Generic repo examples live in the committed `public/data/events.default.json`. Local deployment events live in ignored `public/data/events.content.json`. The website uses the local file when it exists and otherwise falls back to the defaults.

When saving events, the editor writes `events.content.json` and regenerates ignored local `public/pages/events/*.html` wrapper pages. Active and archived events share the same model. Active events can use an approved HTTPS ticket embed URL; Clevertix iframe links end in `?iframe=1`. The embedded shop is shown inside the event page while the external ticket URL remains available as a fallback. The optional ticket embed height uses a compact `316` pixel default and accepts whole-number overrides from `240` to `1200`. Archive mode clears ticket fields automatically, keeps galleries visible, and links back to the homepage `#archive` section.

New events can be saved with a title only. Empty cover images use the logo fallback. Approved embeds include YouTube, Spotify, SoundCloud, Bandcamp and Challonge tournament modules.

## Culture Detail Pages

Homepage culture cards are configured in `public/data/site.local.json` under `cultureSection.cards`. Use `href` values such as `pages/culture-detail.html?id=hiphop`.

The detail page content is configured in `public/data/culture.local.json`. See `docs/culture.md`.

## Instagram Latest Four

Contact handles belong in `public/data/site.local.json` under `contactSection.socialLinks`, next to `contactSection.instagramLabel`. This mirrors the homepage contact card.

The website loads the newest posts live first. Edit `public/data/instagram-feed.local.json` only as a resilient fallback and keep the newest four known posts at the top. Use `media_url` for the image and `permalink` for the click target. See [`instagram.md`](instagram.md) for the exact request flow.
