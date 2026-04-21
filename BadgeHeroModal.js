let modalBound = false;
let escHandlerBound = false;
const dispatchTutorialAction = (action) => {
  if (!action) return;
  window.dispatchEvent(new CustomEvent(String(action)));
};

const qs = (id) => document.getElementById(id);

function getModalElements() {
  const overlay = qs("badgeHeroModal");
  const img = qs("badgeHeroModalImage");
  const nameEl = qs("badgeHeroModalName");
  const progressEl = qs("badgeHeroModalProgress");
  const closeBtn = qs("badgeHeroModalClose");
  const closeCtaBtn = qs("badgeHeroModalCloseCta");
  return { overlay, img, nameEl, progressEl, closeBtn, closeCtaBtn };
}

function applyImageFallback(img, fallback = "/images/badges/demo.png") {
  if (!img) return;
  img.onerror = () => {
    img.onerror = null;
    img.src = fallback;
  };
}

export function initBadgeHeroModal() {
  if (modalBound) return;
  const { overlay, closeBtn, closeCtaBtn } = getModalElements();
  if (!overlay) return;

  const close = () => closeBadgeHeroModal();

  if (closeBtn) {
    closeBtn.addEventListener("click", close);
  }
  if (closeCtaBtn) {
    closeCtaBtn.addEventListener("click", close);
  }
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  modalBound = true;

  if (!escHandlerBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const { overlay: currentOverlay } = getModalElements();
      if (!currentOverlay || currentOverlay.hidden) return;
      closeBadgeHeroModal();
    });
    escHandlerBound = true;
  }
}

export function openBadgeHeroModal(badge) {
  const { overlay, img, nameEl, progressEl } = getModalElements();
  if (!overlay || !img || !nameEl || !progressEl || !badge) return;

  const name = String(badge.name || "Next Badge");
  const current = Math.max(0, Number(badge.progress_current || 0));
  const required = Math.max(1, Number(badge.progress_required || 1));
  const progress = `${current} / ${required}`;
  const src = String(badge.image_url || "/images/badges/demo.png");

  img.src = src;
  img.alt = `${name} badge`;
  applyImageFallback(img);
  nameEl.textContent = name;
  progressEl.textContent = progress;

  overlay.hidden = false;
  document.body.classList.add("badge-hero-modal-open");
}

export function closeBadgeHeroModal() {
  const { overlay } = getModalElements();
  if (!overlay) return;
  overlay.hidden = true;
  document.body.classList.remove("badge-hero-modal-open");
  dispatchTutorialAction("aa:tutorial-badge-hero-dismissed");
}
