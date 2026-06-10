const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const DEFAULT_PLACEHOLDER = "assets/icons/site-placeholder.svg";

export function cultureImageReferenceErrors(cultureContent = {}) {
  const errors = {};
  const themes = Array.isArray(cultureContent?.themes) ? cultureContent.themes : [];
  themes.forEach((theme, themeIndex) => {
    const themeId = cleanString(theme?.id);
    for (const section of ["leads", "artists"]) {
      const people = Array.isArray(theme?.[section]) ? theme[section] : [];
      people.forEach((person, personIndex) => {
        const image = cleanString(person?.image);
        if (!image) return;
        const field = `themes.${themeIndex}.${section}.${personIndex}.image`;
        const error = validateCulturePersonImage(image, themeId);
        if (error) errors[field] = error;
        if (!themeId) errors[`themes.${themeIndex}.id`] = "Theme id is required when culture people use images.";
      });
    }
  });
  return errors;
}

export function cultureImageReferenceMessages(cultureContent = {}, source = "culture content") {
  return Object.entries(cultureImageReferenceErrors(cultureContent))
    .map(([field, message]) => `${source}: ${field}: ${message}`);
}

function validateCulturePersonImage(image, themeId) {
  if (image === DEFAULT_PLACEHOLDER) return "";
  if (/^https?:\/\//i.test(image)) {
    return "Culture person images must be stored locally under assets/images/culture/<theme-id>/.";
  }
  if (image.startsWith("/") || image.includes("..") || image.includes("\\") || image.includes("\0")) {
    return "Culture person image path must be a safe relative path.";
  }
  const extension = image.slice(image.lastIndexOf(".")).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    return "Culture person image path must end in jpg, jpeg, png, webp or gif.";
  }
  if (!themeId) {
    return "Culture person image requires a theme id.";
  }
  const expectedPrefix = `assets/images/culture/${slugify(themeId)}/`;
  if (!image.startsWith(expectedPrefix)) {
    return `Culture person image must start with ${expectedPrefix}.`;
  }
  return "";
}

function cleanString(value = "") {
  return String(value ?? "").trim();
}

function slugify(value = "culture") {
  const slug = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || "culture";
}
