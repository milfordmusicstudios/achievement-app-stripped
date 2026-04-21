const qs = (id) => document.getElementById(id);

function addImageFallback(img, fallback = "/images/badges/demo.png") {
  if (!img) return;
  img.onerror = () => {
    img.onerror = null;
    img.src = fallback;
  };
}

export function renderBadgeHeroHalfPanel({ badge, recentBadge = null, allEarned = false, onOpenModal, onDebug = null } = {}) {
  const card = qs("nextUpBadgeCard");
  const image = qs("nextUpBadgeImage");
  const lockedImage = qs("nextUpLockedBadgeImage");
  const debugBtn = qs("nextUpDebugBtn");
  const nameEl = qs("nextUpBadgeName");
  const targetNameEl = qs("nextUpTargetName");
  const progressEl = qs("nextUpBadgeProgressText");
  const fillEl = qs("nextUpBadgeProgressFill");
  const track = card ? card.querySelector(".next-up-progress-track") : null;

  if (!card || !image || !nameEl || !targetNameEl || !progressEl || !fillEl) return;

  const bindOpen = () => {
    card.onclick = null;
    card.onkeydown = null;
    if (debugBtn) debugBtn.onclick = null;
    if (typeof onOpenModal === "function") {
      const open = (event) => {
        if (event?.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
        event?.preventDefault?.();
        onOpenModal(badge);
      };
      card.onclick = open;
      card.onkeydown = open;
    }

    if (debugBtn && typeof onDebug === "function") {
      debugBtn.onclick = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        onDebug();
      };
    }
  };

  const recentName = String(recentBadge?.name || "").trim() || "No badge earned yet";
  const recentImage = String(recentBadge?.image_url || "").trim() || "/images/badges/demo.png";
  nameEl.textContent = recentName;
  image.src = recentImage;
  image.alt = `${recentName} badge`;
  addImageFallback(image);
  if (lockedImage) {
    lockedImage.src = "/images/badges/demo.png";
    lockedImage.alt = "Locked next badge";
    addImageFallback(lockedImage);
  }
  card.classList.remove("next-up-card--all-earned");

  if (!badge) {
    if (allEarned) {
      card.classList.add("next-up-card--all-earned");
      targetNameEl.textContent = "All badges earned";
      progressEl.textContent = "100%";
      fillEl.style.width = "100%";
      if (lockedImage) {
        lockedImage.src = recentImage;
        lockedImage.alt = "All badges earned";
      }
      if (track) {
        track.setAttribute("aria-valuenow", "100");
        track.setAttribute("aria-label", "All badges earned");
      }
      bindOpen();
      card.hidden = false;
      return;
    }

    targetNameEl.textContent = "Next badge unavailable";
    progressEl.textContent = "-- / --";
    fillEl.style.width = "0%";
    if (track) {
      track.setAttribute("aria-valuenow", "0");
      track.setAttribute("aria-label", "Next badge unavailable");
    }
    bindOpen();
    card.hidden = false;
    return;
  }

  const name = String(badge.name || "Next badge to unlock");
  const current = Math.max(0, Number(badge.progress_current || 0));
  const required = Math.max(1, Number(badge.progress_required || 1));
  const percent = Math.max(0, Math.min(100, Math.round(Number(badge.progressPct || 0) * 100)));
  targetNameEl.textContent = name;
  progressEl.textContent = `${current} of ${required}`;
  fillEl.style.width = `${percent}%`;
  if (lockedImage) {
    const nextImage = String(badge.image_url || "").trim() || "/images/badges/demo.png";
    lockedImage.src = nextImage;
    lockedImage.alt = `${name} (locked)`;
    addImageFallback(lockedImage);
  }
  if (track) {
    track.setAttribute("aria-valuenow", String(percent));
    track.setAttribute("aria-label", `${name} progress`);
  }

  bindOpen();
  card.hidden = false;
}
