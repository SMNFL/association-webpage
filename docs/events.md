# Events

Events are edited through the local editor at `http://localhost:8080/editor/` after starting:

```bash
npm run editor
```

The committed reusable template is `public/data/events.default.json`. It contains generic active and archived examples with every supported field.

The local canonical event file is `public/data/events.content.json`. It is ignored by Git because it contains deployment-specific events. The public website loads this local file when present and falls back to `events.default.json` otherwise.

The reusable defaults include matching wrapper pages for the generic example events in `public/pages/events/`. The editor validates and saves `events.content.json`, then generates deployment-specific `public/pages/events/*.html` wrapper pages locally. Generated local wrapper pages are ignored by Git. Do not edit generated local pages by hand.

`public/data/events.local.json` belongs to the obsolete pre-editor structure and is not read by the website or editor.

## Event Model

Active and archived events use the same object shape. Important fields:

- `title`: required event name
- `id` / `slug`: page slug, generated from the title when empty
- `status`: `upcoming` or `archive`
- `date` and `displayDate`: machine date plus optional public date text
- `image` / `coverImage`: cover image path
- `description`: one paragraph per line in the editor
- `ticketUrl`: optional external ticket-shop link, opened in a new tab
- `ticketEmbed`: optional approved HTTPS iframe URL shown inside active event pages; for Clevertix, use the ticket-shop URL ending in `?iframe=1`
- `ticketEmbedHeight`: optional embedded ticket-shop height in pixels; empty values use `316`, overrides must be whole numbers from `240` to `1200`
- `gallery`: archive or event gallery image paths
- `sections`: extra page sections managed by repeatable editor controls

Image paths must be safe relative paths under `assets/images/` or `assets/icons/`, or an external `https://` URL.

## Archive Rules

Use the editor's archive action when an event is over. Archive mode:

- sets `status` to `archive`
- clears ticket fields
- keeps gallery images
- shows the event in the homepage archive slider
- renders the generated event page without ticket buttons or ticket widgets

Active events can show an embedded ticket shop and retain the external ticket link as a fallback. The embedded URL is restricted to approved HTTPS providers and rendered as a responsive iframe. Archived event pages link back to the homepage `#archive` section.

Archive images conventionally live under:

```text
public/assets/images/eventsArchive/YYYY-MM-DD-event-slug/display/
```

The media upload form can create this folder automatically from the selected event date and slug.

## Local Presentation Overrides

Generic defaults keep gallery helper text and embed section headings visible. A local site can hide them in `public/data/site.local.json`:

```json
{
  "eventsSection": {
    "labels": {
      "showGalleryDescription": false,
      "showEmbedsHeading": false
    }
  }
}
```
