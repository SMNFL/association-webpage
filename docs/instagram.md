# Instagram Live Feed

The homepage always attempts to load the newest public Instagram posts first. A local JSON file is used only when the live request fails.

No Instagram access token is required. Do not put tokens into frontend JavaScript or JSON files.

## Site Configuration

For a local site, edit `public/data/site.local.json`:

```json
"instagram": {
  "username": "example",
  "profileUrl": "https://www.instagram.com/example/",
  "fallbackFeed": "data/instagram-feed.local.json",
  "postLimit": 4
}
```

The handles shown in the homepage contact card belong beside the other contact content:

```json
"contactSection": {
  "instagramLabel": "Instagram",
  "socialLinks": [
    {
      "label": "@example",
      "url": "https://www.instagram.com/example/"
    }
  ]
}
```

## Request Flow

The browser uses one fixed sequence:

1. Request `/api/instagram-feed?username=...&limit=4` on the self-hosted Node server.
2. If that route is unavailable, request `/.netlify/functions/instagram-feed?username=...&limit=4` for Netlify/static deployments.
3. Render the newest public posts returned by the first successful live endpoint.
4. If both live requests fail or return no posts, load `public/data/instagram-feed.local.json`.
5. If the fallback also has no posts, show a clean link to the Instagram profile.

There is no second live provider and no embedded-post compatibility mode.

## Live Endpoint

The same live handler is available in both supported server environments:

- Node self-hosting: `/api/instagram-feed` and `/.netlify/functions/instagram-feed`
- Netlify: `/.netlify/functions/instagram-feed`

Both routes read the public Instagram profile server-side, normalize the latest four posts, cache successful responses briefly, and proxy trusted Instagram images with size and timeout limits.

The endpoint uses Instagram's public profile response rather than an official authenticated Instagram API integration. It needs no token, but Instagram can change or restrict that response without notice. The fallback file keeps the homepage useful during an outage. If a future deployment adopts an official API, keep its access token server-side and preserve the same normalized browser response shape.

## Update The Fallback

Edit `public/data/instagram-feed.local.json` and keep the newest four known posts at the top:

```json
{
  "source": "manual-latest-posts",
  "profile": {
    "username": "example",
    "permalink": "https://www.instagram.com/example/"
  },
  "posts": [
    {
      "media_type": "IMAGE",
      "media_url": "assets/images/post-01.jpg",
      "permalink": "https://www.instagram.com/p/example/",
      "caption": "Short caption"
    }
  ]
}
```

`public/data/site.local.json` and `public/data/instagram-feed.local.json` are ignored by Git because they contain deployment-specific content. Tracked `*.example.json` and `*.default.json` files use placeholder data.

## Deployment

For Node self-hosting, run the server as documented in [`SELF_HOSTING.md`](SELF_HOSTING.md). This is the primary production path when you host on your own machine, Raspberry Pi, or VPS.

For Netlify, deploy the repository with `public` as the publish directory and keep `netlify/functions/instagram-feed.js` enabled. No additional environment variables are needed.

Pure static hosting without a server function still shows fallback cards, but it cannot fetch current Instagram posts automatically.
