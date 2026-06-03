# Culture Detail Pages

The Culture, Music, Chill cards on the homepage can link to reusable detail pages.

## Edit Cards

Cards live in the merged site data:

```json
"cultureSection": {
  "cards": [
    {
      "title": "HipHop",
      "href": "pages/culture-detail.html?id=hiphop",
      "linkLabel": "Artists entdecken"
    }
  ]
}
```

For local site content, edit:

```text
public/data/site.local.json
```

## Edit Detail Content

Detail page content is loaded from:

```text
public/data/culture.local.json
```

Each theme needs a stable `id`. The homepage card URL uses the same id:

```text
pages/culture-detail.html?id=hiphop
```

You can add:

- `title`
- `description`
- `image`
- `links`
- `leads`
- `artists`

Images can be local files such as `assets/images/my-image.jpg` or preserved remote URLs.
