export function initNavigation() {
  const header = document.querySelector(".site-header");
  const menuButton = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("[data-nav]");
  const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
  const sections = navLinks
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith("#"))
    .map((href) => document.getElementById(href.slice(1)))
    .filter(Boolean);
  let resizeFrame = 0;
  let scrollFrame = 0;

  function closeMenu() {
    if (!menuButton || !nav) return;
    menuButton.setAttribute("aria-expanded", "false");
    nav.dataset.open = "false";
    updateMenuMetrics();
  }

  function inlineNavigationWidth() {
    if (!header || !nav) return 0;
    const probe = nav.cloneNode(true);
    probe.removeAttribute("id");
    probe.classList.add("site-nav--measure");
    probe.setAttribute("aria-hidden", "true");
    header.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }

  function updateCollapsedState() {
    if (!header || !menuButton || !nav) return;
    const styles = window.getComputedStyle(header);
    const availableWidth = header.clientWidth
      - Number.parseFloat(styles.paddingLeft)
      - Number.parseFloat(styles.paddingRight);
    const brandWidth = header.querySelector(".brand")?.getBoundingClientRect().width || 0;
    const headerGap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
    const collapsed = brandWidth + headerGap + inlineNavigationWidth() > availableWidth;
    header.dataset.collapsed = String(collapsed);
    updateHeaderMetrics();
    if (!collapsed) closeMenu();
  }

  function updateHeaderMetrics() {
    if (!header) return;
    document.documentElement.style.setProperty("--header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    updateMenuMetrics();
  }

  function updateMenuMetrics() {
    if (!nav) return;
    const open = nav.dataset.open === "true";
    const height = open ? Math.ceil(nav.getBoundingClientRect().height) : 0;
    document.documentElement.classList.toggle("nav-open", open);
    document.documentElement.style.setProperty("--mobile-menu-height", `${height}px`);
  }

  function scheduleCollapsedStateUpdate() {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(updateCollapsedState);
  }

  function updateActiveLink() {
    if (!sections.length) return;
    const headerHeight = header?.getBoundingClientRect().height || 0;
    const marker = window.scrollY + headerHeight + 20;
    const orderedSections = [...sections].sort((a, b) => a.offsetTop - b.offsetTop);
    const activeSection = orderedSections.reduce((current, section) => (
      section.offsetTop <= marker ? section : current
    ), orderedSections[0]);
    const activeHref = `#${activeSection.id}`;
    navLinks.forEach((link) => {
      if (link.getAttribute("href") === activeHref) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function scheduleActiveLinkUpdate() {
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(updateActiveLink);
  }

  menuButton?.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    nav.dataset.open = String(!isOpen);
    updateMenuMetrics();
    window.requestAnimationFrame(updateMenuMetrics);
  });

  navLinks.forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  document.addEventListener("click", (event) => {
    if (header && !header.contains(event.target)) closeMenu();
  });
  window.addEventListener("resize", scheduleCollapsedStateUpdate);
  window.addEventListener("resize", updateHeaderMetrics);
  window.addEventListener("resize", scheduleActiveLinkUpdate);
  window.addEventListener("scroll", scheduleActiveLinkUpdate, { passive: true });
  window.addEventListener("hashchange", scheduleActiveLinkUpdate);
  new ResizeObserver(scheduleCollapsedStateUpdate).observe(header);
  new ResizeObserver(updateHeaderMetrics).observe(header);
  new MutationObserver(scheduleCollapsedStateUpdate).observe(nav, { childList: true, subtree: true, characterData: true });
  document.fonts?.ready.then(scheduleCollapsedStateUpdate);
  scheduleCollapsedStateUpdate();
  updateHeaderMetrics();
  scheduleActiveLinkUpdate();

  const headerObserver = new IntersectionObserver(([entry]) => {
    header?.classList.toggle("site-header--scrolled", !entry.isIntersecting);
  });

  const sentinel = document.querySelector("[data-header-sentinel]");
  if (sentinel) headerObserver.observe(sentinel);
}
