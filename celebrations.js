let celebrationQueue = [];
let isCelebrationActive = false;
let confettiLoaderPromise = null;
let celebrationsInitialized = false;
let lastCelebrationShownAt = 0;

function ensureCelebrationOverlay() {
  let overlay = document.getElementById("celebrationOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "celebrationOverlay";
  overlay.className = "celebration-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="celebration-content">
      <img id="celebrationImage" alt="Celebration image">
      <h1 id="celebrationTitle"></h1>
      <p id="celebrationText"></p>
      <button id="celebrationBtn" type="button">Continue</button>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function resetOverlayToHidden() {
  const overlay = ensureCelebrationOverlay();
  const img = document.getElementById("celebrationImage");
  const title = document.getElementById("celebrationTitle");
  const text = document.getElementById("celebrationText");
  const btn = document.getElementById("celebrationBtn");

  overlay.hidden = true;
  if (img) {
    img.onerror = null;
    img.src = "/images/badges/demo.png";
  }
  if (title) {
    title.textContent = "";
    title.hidden = true;
  }
  if (text) {
    text.textContent = "";
    text.hidden = true;
  }
  if (btn) btn.disabled = false;
}

function wireContinueButton(btn) {
  if (!btn) return;
  const handler = (event) => {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    if (event && typeof event.stopPropagation === "function") event.stopPropagation();
    closeCelebration();
    // Emergency fallback: if state is corrupted, force-close overlay anyway.
    window.setTimeout(() => {
      const overlay = document.getElementById("celebrationOverlay");
      if (overlay && !overlay.hidden && celebrationQueue.length === 0) {
        resetOverlayToHidden();
        isCelebrationActive = false;
      }
    }, 0);
  };
  btn.onclick = handler;
  btn.onpointerup = handler;
  btn.ontouchend = handler;
}

async function ensureConfetti() {
  if (typeof window.confetti === "function") return true;
  if (!confettiLoaderPromise) {
    confettiLoaderPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }
  return confettiLoaderPromise;
}

function fireConfetti(options) {
  if (typeof window.confetti !== "function") return;
  window.confetti(options);
}

function normalizeBadgeData(raw = {}) {
  const slug = String(raw.slug || raw.badge_slug || "").trim();
  return {
    ...raw,
    slug,
    name: String(raw.name || raw.title || slug || "Badge").trim(),
    image_url: String(raw.image_url || (slug ? `/images/badges/${slug}.png` : "/images/badges/demo.png"))
  };
}

function normalizeLevelData(raw = {}) {
  const level = Number(raw.level ?? raw.levelNumber ?? raw.id ?? 0) || 0;
  const fallbackLevel = Math.max(1, level || 1);
  return {
    ...raw,
    level: level || fallbackLevel,
    image_url: String(raw.image_url || raw.badge || `/images/levelBadges/level${fallbackLevel}.png`)
  };
}

export function buildCelebrationItemsFromResponse(response = {}) {
  const items = [];
  const awardedBadges = Array.isArray(response?.awardedBadges) ? response.awardedBadges : [];
  for (const badge of awardedBadges) {
    items.push({ type: "badge", data: normalizeBadgeData(badge) });
  }

  if (response?.leveledUp && typeof response.leveledUp === "object") {
    items.push({ type: "level", data: normalizeLevelData(response.leveledUp) });
  }

  return items;
}

export function queueCelebrations(items = []) {
  if (!Array.isArray(items) || !items.length) return;
  const normalizedItems = items
    .filter((item) => item && (item.type === "badge" || item.type === "level"))
    .map((item) => ({
      type: item.type,
      data: item.data || {}
    }));
  if (!normalizedItems.length) return;
  celebrationQueue.push(...normalizedItems);
  if (!isCelebrationActive) {
    showNextCelebration();
  }
}

async function showNextCelebration() {
  if (!celebrationQueue.length) {
    resetOverlayToHidden();
    isCelebrationActive = false;
    return;
  }

  isCelebrationActive = true;
  await ensureConfetti();

  const item = celebrationQueue.shift();
  if (!item || !item.type) {
    closeCelebration();
    return;
  }

  if (item.type === "badge") renderBadgeCelebration(item.data || {});
  else if (item.type === "level") renderLevelCelebration(item.data || {});
  else closeCelebration();
}

function renderBadgeCelebration(badge) {
  const overlay = ensureCelebrationOverlay();
  const img = document.getElementById("celebrationImage");
  const title = document.getElementById("celebrationTitle");
  const text = document.getElementById("celebrationText");
  const btn = document.getElementById("celebrationBtn");

  const data = normalizeBadgeData(badge);
  img.onerror = () => {
    img.onerror = null;
    img.src = "/images/badges/demo.png";
  };
  img.src = data.image_url;
  title.textContent = "YOU UNLOCKED A BADGE!";
  title.hidden = false;
  text.textContent = data.name;
  text.hidden = false;
  lastCelebrationShownAt = Date.now();
  overlay.hidden = false;

  fireConfetti({
    particleCount: 140,
    spread: 80,
    origin: { y: 0.6 },
    colors: ["#4aa3ff", "#ffd166", "#ffffff"]
  });

  btn.disabled = false;
  wireContinueButton(btn);
}

function renderLevelCelebration(level) {
  const overlay = ensureCelebrationOverlay();
  const img = document.getElementById("celebrationImage");
  const title = document.getElementById("celebrationTitle");
  const text = document.getElementById("celebrationText");
  const btn = document.getElementById("celebrationBtn");

  const data = normalizeLevelData(level);
  img.onerror = () => {
    img.onerror = null;
    img.src = "/images/levelBadges/level1.png";
  };
  img.src = data.image_url;
  title.textContent = "LEVEL UP!";
  title.hidden = false;
  text.textContent = `You reached Level ${data.level}`;
  text.hidden = false;
  lastCelebrationShownAt = Date.now();
  overlay.hidden = false;

  fireConfetti({
    particleCount: 240,
    spread: 100,
    startVelocity: 45,
    origin: { y: 0.5 },
    colors: ["#ffd166", "#ffb703", "#ffffff"]
  });

  btn.disabled = false;
  wireContinueButton(btn);
}

function closeCelebration() {
  resetOverlayToHidden();
  if (celebrationQueue.length) {
    showNextCelebration();
    return;
  }
  isCelebrationActive = false;
}

function initCelebrationsUI() {
  if (celebrationsInitialized) return;
  celebrationsInitialized = true;

  resetOverlayToHidden();
  const btn = document.getElementById("celebrationBtn");
  wireContinueButton(btn);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.id === "celebrationBtn") {
      closeCelebration();
      return;
    }
    if (target.id === "celebrationOverlay" && isCelebrationActive) {
      closeCelebration();
    }
  }, true);
  document.addEventListener("pointerup", (event) => {
    const target = event.target;
    if (target instanceof Element && target.id === "celebrationBtn") {
      closeCelebration();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isCelebrationActive) {
      closeCelebration();
    }
  });
}

function recoverOrphanedOverlay() {
  const overlay = document.getElementById("celebrationOverlay");
  if (!overlay) return;
  if (!overlay.hidden && !isCelebrationActive && celebrationQueue.length === 0) {
    resetOverlayToHidden();
    return;
  }
  // If overlay has been open too long without queue progression, unblock the app.
  const openTooLong = !overlay.hidden && isCelebrationActive && celebrationQueue.length === 0
    && Date.now() - lastCelebrationShownAt > 15000;
  if (openTooLong) {
    resetOverlayToHidden();
    isCelebrationActive = false;
  }
}

if (typeof window !== "undefined") {
  initCelebrationsUI();
  window.addEventListener("pageshow", () => {
    if (!isCelebrationActive) resetOverlayToHidden();
    recoverOrphanedOverlay();
  });
  window.addEventListener("visibilitychange", recoverOrphanedOverlay);
  window.setInterval(recoverOrphanedOverlay, 750);
  window.queueCelebrations = queueCelebrations;
}
