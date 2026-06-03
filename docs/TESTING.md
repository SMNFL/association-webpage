# Tests

Tests live under `tests/` and should be extended when features are added or existing behavior is removed.

## Unit Tests

```bash
npm run test:unit
```

Currently covered:

- Contact form validation
- Subject defaults for booking, contact, volunteer, and membership requests
- Event model helpers for archive state, ticket state, URLs, and galleries
- Editor event validation for status, image paths, and slug collisions
- Event defaults with complete schema and local override fallback
- SMTP mail delivery with mock transport
- Instagram feed normalization
- JSON files in `public/data`
- Editor password hashing, sessions, logout, expiry, and CSRF
- Localhost protection and login rate limiting
- Rich HTML sanitizing, embed allowlist, and upload signatures
- Challonge tournament embeds and default image handling for new events
- Contact form size limits and Instagram CDN allowlist
- Theme normalization, CSS variables, and validation errors
- Safe main-gallery references and element type labels

## Browser Tests

```bash
npm run test:e2e
```

The browser test server starts in isolation on `127.0.0.1:8090` and does not use an already running development server. This prevents old local processes from affecting test results.

Currently covered:

- Homepage loads without console errors
- Instagram shows 4 preview cards
- Instagram shows the account on the left and post count on the right in the feed header
- Instagram tries the live endpoint first and uses local JSON only as fallback
- Bylaws table of contents stays visible while scrolling
- Footer links on subpages return to `#footer`, while explicit `back` parameters take priority
- hCaptcha is visible when a site key exists in local configuration
- Contact section shows handles maintained under `contactSection.socialLinks`
- Archive cards link to local event pages
- Event rendering falls back to generic defaults without a local event file
- Event titles stay separate from images at desktop, tablet, and mobile widths; long titles wrap without horizontal overflow
- Active event card actions stay visually separate and ticket links wrap to a new line in narrow spaces
- The editor requires login, groups link text with `href`, tests theme preview/save/discard, filters legal notice content, checks media folder filtering, safely adds and removes main-gallery references after confirmation, creates an event with safe ticket-shop iframe plus external fallback link, rejects missing CSRF, archives the event, logs out, and the public archive page shows a gallery without tickets plus a backlink to `#archive`
- Contact form accepts the canonical `subject` query parameter and legacy aliases
- Key subpages render

## Extension Rule

When a feature is added, add at least one unit test for data or logic behavior. If the feature is visible in the browser, add an E2E smoke test too.

Before deployments, also run:

```bash
npm run release:check-public
npm audit --omit=dev
```

The E2E smoke server intentionally returns `404` for ignored local overrides. That verifies the reusable defaults and keeps browser tests working in a clean checkout without private content.
