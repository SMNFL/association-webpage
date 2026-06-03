export function isArchive(event = {}) {
  return event.status === "archive";
}

export function isPast(event = {}) {
  if (isArchive(event)) return true;
  if (event.status === "upcoming") return false;
  if (!event.date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${event.date}T23:59:59`) < today;
}

export function hasTickets(event = {}) {
  return !isArchive(event) && Boolean(event.ticketUrl || event.ticketLink || event.ticketEmbed);
}

export function ticketEmbedHeight(event = {}) {
  const height = Number(event.ticketEmbedHeight);
  return Number.isInteger(height) && height >= 240 && height <= 1200 ? height : 316;
}

export function eventUrl(event = {}, index = 0) {
  const id = event.id || event.slug || `event-${index + 1}`;
  return event.href || event.detailUrl || `pages/events/${encodeURIComponent(id)}.html`;
}

export function eventExcerpt(event = {}) {
  if (event.excerpt) return event.excerpt;
  if (Array.isArray(event.description)) return event.description[0] || "";
  return event.description || "";
}

export function normalizeGallery(event = {}) {
  return (event.gallery || [])
    .map((image, index) => (
      typeof image === "string" ? { src: image, alt: `${event.title || "Event"} Bild ${index + 1}` } : image
    ))
    .filter((image) => image?.src);
}

export function sortEventsForDisplay(events = []) {
  return [...events].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export function splitEventsForDisplay(events = []) {
  const sorted = sortEventsForDisplay(events);
  return {
    upcoming: sorted.filter((event) => !isPast(event)),
    archive: sorted.filter(isPast)
  };
}
