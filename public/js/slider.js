export function initContentSlider(slider, options = {}) {
  const viewport = slider?.querySelector(options.viewportSelector);
  const track = slider?.querySelector(options.trackSelector);
  const prevButton = slider?.querySelector(options.prevSelector);
  const nextButton = slider?.querySelector(options.nextSelector);
  if (!slider || !viewport || !track || !prevButton || !nextButton) return () => {};

  const getVisibleCount = options.getVisibleCount || (() => 1);
  const getStep = options.getStep || getVisibleCount;
  const getMaxIndex = options.getMaxIndex || (() => Math.max(0, track.children.length - getVisibleCount()));
  const beforeUpdate = options.beforeUpdate || (() => {});
  let currentIndex = 0;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerTracking = false;
  let resizeFrame = 0;

  function update() {
    beforeUpdate(track);
    currentIndex = Math.min(Math.max(currentIndex, 0), getMaxIndex(track));
    const activeItem = track.children[currentIndex];
    const offset = activeItem ? activeItem.offsetLeft : 0;
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    prevButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex >= getMaxIndex(track);
  }

  function goTo(index) {
    currentIndex = index;
    update();
  }

  function step(direction) {
    goTo(currentIndex + (getStep(track) * direction));
  }

  function handleKeydown(event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  }

  function handlePointerDown(event) {
    if (event.pointerType === "mouse") return;
    pointerTracking = true;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
  }

  function handlePointerUp(event) {
    if (!pointerTracking) return;
    pointerTracking = false;
    const deltaX = event.clientX - pointerStartX;
    const deltaY = event.clientY - pointerStartY;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    step(deltaX < 0 ? 1 : -1);
  }

  function handlePointerCancel() {
    pointerTracking = false;
  }

  function scheduleUpdate() {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      update();
    });
  }

  prevButton.addEventListener("click", () => step(-1));
  nextButton.addEventListener("click", () => step(1));
  slider.addEventListener("keydown", handleKeydown);
  viewport.addEventListener("pointerdown", handlePointerDown);
  viewport.addEventListener("pointerup", handlePointerUp);
  viewport.addEventListener("pointercancel", handlePointerCancel);
  window.addEventListener("resize", scheduleUpdate);
  window.requestAnimationFrame(update);

  return () => {
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    prevButton.replaceWith(prevButton.cloneNode(true));
    nextButton.replaceWith(nextButton.cloneNode(true));
    slider.removeEventListener("keydown", handleKeydown);
    viewport.removeEventListener("pointerdown", handlePointerDown);
    viewport.removeEventListener("pointerup", handlePointerUp);
    viewport.removeEventListener("pointercancel", handlePointerCancel);
    window.removeEventListener("resize", scheduleUpdate);
  };
}
