# Content Maintenance

The website uses JSON data and shared JavaScript renderers so content can be maintained without large HTML edits.

## Events

Add new events in the local editor:

```bash
npm run editor
```

Then open `http://localhost:8080/editor/` and use the `Events` section. The committed template with every field is `public/data/events.default.json`. Local events are saved in `public/data/events.content.json`. That file and the locally generated `public/pages/events/*.html` wrapper pages are not committed.

An event should contain at least:

- unique `id`
- `title`
- `date`
- `status`: `upcoming` or `archive`
- `image`
- short description

When an event is over, use the editor's `Archive event` button. This sets `status` to `archive`, clears ticket data, keeps gallery images, and makes the event appear in the archive automatically.

Active events can optionally embed a ticket shop. For Clevertix, use the HTTPS URL ending in `?iframe=1`. The optional `ticketEmbedHeight` defaults to `316` pixels and accepts whole-number values from `240` to `1200`.

## Archive Galleries

Archive images live under `public/assets/images/eventsArchive/`. New event folders should start with the date, for example:

```text
2026-06-15-event-name/
```

The editor can place archive uploads automatically into `eventsArchive/YYYY-MM-DD-event-slug/display/` when an event is selected during upload.

Deployment-specific media stays local and is intentionally excluded by `.gitignore`. For a real website, publish those files through a private deployment artifact or separate private media pipeline, not through the reusable public repository.

## Instagram

Visible Instagram cards are loaded live through `/api/instagram-feed` in the Node server first. For Netlify/static deployments, the fallback endpoint is `/.netlify/functions/instagram-feed`. If Instagram is unreachable, the website uses `public/data/instagram-feed.local.json`.

The profile link and handle are in `public/data/site.local.json` under `instagram`; links in the contact section live under `contactSection.socialLinks`. Details: [`instagram.md`](instagram.md).

## Legal Pages

Bylaws, legal notice, and privacy policy pages should keep the full original legal text for the active deployment. Layout or navigation changes must not shorten that text.
