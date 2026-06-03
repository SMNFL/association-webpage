export const THEME_PRESETS = {
  sukura: {
    preset: "sukura",
    themeColor: "#060811",
    colors: {
      background: "#050712",
      backgroundSoft: "#0a0d1d",
      surface: "#101427",
      surfaceStrong: "#181e36",
      text: "#f5f7fb",
      muted: "#aeb7c8",
      primary: "#3df7df",
      secondary: "#ff4fd8",
      highlight: "#d5ff5f"
    },
    layout: { containerWidth: 1160, cornerStyle: "soft", density: "comfortable" },
    typography: { fontFamily: "sora", textSize: "standard" },
    effects: { ambient: true, backgroundGrid: true }
  },
  "minimal-dark": {
    preset: "minimal-dark",
    themeColor: "#101417",
    colors: {
      background: "#101417",
      backgroundSoft: "#171d20",
      surface: "#1e2629",
      surfaceStrong: "#283236",
      text: "#f4f7f6",
      muted: "#b2bfbb",
      primary: "#72d9c3",
      secondary: "#e48bcf",
      highlight: "#d2e98b"
    },
    layout: { containerWidth: 1120, cornerStyle: "compact", density: "comfortable" },
    typography: { fontFamily: "system", textSize: "standard" },
    effects: { ambient: false, backgroundGrid: false }
  },
  "high-contrast": {
    preset: "high-contrast",
    themeColor: "#000000",
    colors: {
      background: "#000000",
      backgroundSoft: "#111111",
      surface: "#181818",
      surfaceStrong: "#242424",
      text: "#ffffff",
      muted: "#d6d6d6",
      primary: "#00ffe0",
      secondary: "#ff5edb",
      highlight: "#e2ff66"
    },
    layout: { containerWidth: 1200, cornerStyle: "compact", density: "comfortable" },
    typography: { fontFamily: "system", textSize: "large" },
    effects: { ambient: false, backgroundGrid: false }
  }
};

export function galleryHasPath(gallery = [], mediaPath = "") {
  return gallery.some((item) => galleryPath(item) === mediaPath);
}

export function addGalleryReference(gallery = [], mediaPath, alt) {
  if (galleryHasPath(gallery, mediaPath)) return gallery;
  return [...gallery, { src: mediaPath, alt: String(alt || "").trim() }];
}

export function removeGalleryReference(gallery = [], mediaPath) {
  return gallery.filter((item) => galleryPath(item) !== mediaPath);
}

export function elementType(group = {}) {
  const keys = group.fields?.map((field) => field.key) || [];
  if (keys.some((key) => ["src", "image", "hero", "logo", "socialPreview"].includes(key))) return "Image";
  if (keys.some((key) => ["href", "url", "profileUrl", "mapsUrl", "mapsEmbedUrl"].includes(key))) return "Link";
  if (keys.some((key) => ["title", "heading", "signal"].includes(key))) return "Heading";
  if (keys.some((key) => ["description", "body", "text", "paragraphs", "value"].includes(key))) return "Text";
  if (group.path?.includes("gallery")) return "Gallery";
  return "Metadata";
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function galleryPath(item) {
  return typeof item === "string" ? item : item?.src;
}
