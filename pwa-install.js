import { getAuthUserId } from "./utils.js";

const INSTALL_TARGETS = [
  {
    key: "ios",
    label: "iPhone/iPad",
    heading: "Save to Home Screen on iPhone/iPad",
    steps: [
      "Open this app in Safari.",
      "Tap the Share button.",
      "Scroll down and tap \"Add to Home Screen.\"",
      "Tap \"Add.\"",
      "The app icon will now appear on your home screen."
    ]
  },
  {
    key: "android",
    label: "Android",
    heading: "Install on Android",
    steps: [
      "Open this app in Chrome.",
      "Tap the browser menu (three dots).",
      "Tap \"Install app\" or \"Add to Home screen.\"",
      "Confirm by tapping \"Install\" or \"Add.\"",
      "The app icon will now appear on your home screen."
    ]
  },
  {
    key: "desktop",
    label: "Desktop",
    heading: "Install on Desktop",
    steps: [
      "Open this app in Chrome or Edge.",
      "Look for the install icon in the address bar, or open the browser menu.",
      "Click \"Install\" or \"Install app.\"",
      "Confirm the install.",
      "The app will appear like a desktop app and may also be available from the Start menu, Applications folder, or desktop depending on the device."
    ]
  }
];

const TROUBLESHOOTING = [
  "Make sure you opened the app in a supported browser.",
  "Try refreshing the page once.",
  "On iPhone/iPad, this must be done in Safari.",
  "On Android, Chrome usually works best.",
  "On desktop, Chrome or Edge usually works best."
];

const DISABLED_PATHS = new Set(["auth-callback.html"]);
const DISMISS_STORAGE_KEY = "aa.pwaPromptDismissed.v1";
const INSTALL_PROMPT_SEEN_KEY_PREFIX = "install_prompt_seen";

let deferredInstallPrompt = null;
let installPromptUserId = null;
let installPromptUserResolved = false;
let launcherCard = null;
let launcherTitle = null;
let launcherBody = null;
let launcherAction = null;
let launcherDismiss = null;
let installButton = null;
let installStatus = null;
let installHelpButton = null;
let installPanels = null;
let modalOverlay = null;
let sectionTabs = [];
let sectionPanels = [];
let helpExpanded = false;

function detectPlatform() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && touchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isChromeFamily = /Chrome|CriOS|Edg|EdgiOS/i.test(ua);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios|edg).)*safari/i.test(ua);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    window.matchMedia?.("(display-mode: minimal-ui)")?.matches ||
    window.navigator.standalone === true;

  if (isIOS) {
    return { primary: "ios", isIOS, isAndroid: false, isSafari, isChromeFamily, isStandalone };
  }

  if (isAndroid) {
    return { primary: "android", isIOS: false, isAndroid: true, isSafari: false, isChromeFamily, isStandalone };
  }

  return { primary: "desktop", isIOS: false, isAndroid: false, isSafari, isChromeFamily, isStandalone };
}

function getCurrentPage() {
  const path = window.location.pathname || "";
  return path.split("/").pop() || "index.html";
}

function isManualOnlyPlatform(platformState) {
  return platformState.isIOS || platformState.isSafari;
}

function canUseInstallPrompt(platformState) {
  return Boolean(deferredInstallPrompt) && !isManualOnlyPlatform(platformState) && !platformState.isStandalone;
}

function buildInstallPromptSeenKey(userId) {
  const id = String(userId || "").trim();
  return id ? `${INSTALL_PROMPT_SEEN_KEY_PREFIX}_${id}` : null;
}

function readLocalStorage(key) {
  try {
    return key ? localStorage.getItem(key) : null;
  } catch (error) {
    console.warn("[pwa] failed reading install prompt storage", error);
    return null;
  }
}

function writeLocalStorage(key, value) {
  try {
    if (!key) return false;
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("[pwa] failed writing install prompt storage", error);
    return false;
  }
}

async function resolveInstallPromptUserId() {
  if (installPromptUserResolved) return installPromptUserId;
  installPromptUserResolved = true;
  try {
    installPromptUserId = await getAuthUserId();
  } catch (error) {
    console.warn("[pwa] failed resolving auth user for install prompt", error);
    installPromptUserId = null;
  }
  return installPromptUserId;
}

function hasSeenInstallPrompt() {
  const key = buildInstallPromptSeenKey(installPromptUserId);
  if (!key) return true;
  if (readLocalStorage(key) === "1") return true;

  // Backward compatibility: honor the previous global dismissal flag once,
  // then promote it to the per-user key requested for future checks.
  if (readLocalStorage(DISMISS_STORAGE_KEY) === "1") {
    writeLocalStorage(key, "1");
    return true;
  }

  return false;
}

function setInstallPromptSeen() {
  const key = buildInstallPromptSeenKey(installPromptUserId);
  return writeLocalStorage(key, "1");
}

function orderedTargets(primaryKey) {
  const ordered = [...INSTALL_TARGETS];
  const primaryIndex = ordered.findIndex((target) => target.key === primaryKey);
  if (primaryIndex > 0) {
    const [primary] = ordered.splice(primaryIndex, 1);
    ordered.unshift(primary);
  }
  return ordered;
}

function createSectionMarkup(target) {
  const list = target.steps
    .map((step, index) => `<li><span class="pwa-install-modal__step-index">${index + 1}.</span><span>${step}</span></li>`)
    .join("");

  return `
    <section class="pwa-install-modal__section" data-platform="${target.key}">
      <h3>${target.heading}</h3>
      <ol>${list}</ol>
    </section>
  `;
}

function getSafariDesktopMarkup() {
  return `
    <section class="pwa-install-modal__section" data-platform="desktop-safari">
      <h3>Desktop Safari</h3>
      <ol>
        <li><span class="pwa-install-modal__step-index">1.</span><span>Open this app in Safari on your Mac.</span></li>
        <li><span class="pwa-install-modal__step-index">2.</span><span>Open the browser menu or the File menu.</span></li>
        <li><span class="pwa-install-modal__step-index">3.</span><span>If available, choose "Add to Dock" to save the app-like shortcut.</span></li>
        <li><span class="pwa-install-modal__step-index">4.</span><span>If that option is not available, bookmark the page for quick access.</span></li>
      </ol>
    </section>
  `;
}

function buildModal(primaryKey, includeSafariDesktop) {
  const targets = orderedTargets(primaryKey);
  const tabs = targets
    .map((target, index) => `
      <button
        type="button"
        class="pwa-install-modal__tab${index === 0 ? " is-active" : ""}"
        data-target="${target.key}"
        aria-pressed="${index === 0 ? "true" : "false"}"
      >
        ${target.label}
      </button>
    `)
    .join("");

  const sections = targets
    .map((target, index) => `
      <div class="pwa-install-modal__panel${index === 0 ? " is-active" : ""}" data-target="${target.key}">
        ${createSectionMarkup(target)}
      </div>
    `)
    .join("");

  return `
    <div id="pwaInstallOverlay" class="modal-overlay pwa-install-overlay" aria-hidden="true">
      <div class="modal pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
        <div class="modal-header">
          <div>
            <div class="modal-title" id="pwaInstallTitle">Add This App</div>
            <p class="pwa-install-modal__intro">Some devices support a browser install prompt. Others require manual steps from the browser menu or Share button.</p>
          </div>
          <button id="pwaInstallClose" class="modal-close pwa-install-modal__close" type="button" aria-label="Close install tutorial">&times;</button>
        </div>

        <div class="modal-body pwa-install-modal__body">
          <div class="pwa-install-modal__prompt-row">
            <button id="pwaInstallAction" type="button" class="blue-button pwa-install-modal__primary-button">How to Add This App</button>
            <button id="pwaInstallHelp" type="button" class="blue-button blue-button--secondary pwa-install-modal__secondary-button">Help me Install</button>
            <div id="pwaInstallStatus" class="pwa-install-modal__status" aria-live="polite"></div>
          </div>

          <div id="pwaInstallPanels" class="pwa-install-modal__details" hidden>
            <div class="pwa-install-modal__tabs" role="tablist" aria-label="Install instructions by device">
              ${tabs}
            </div>

            <div class="pwa-install-modal__panels">
              ${sections}
              ${includeSafariDesktop ? getSafariDesktopMarkup() : ""}
              <section class="pwa-install-modal__section pwa-install-modal__section--troubleshooting">
                <h3>Don't see "Install" or "Add to Home Screen"?</h3>
                <ul>${TROUBLESHOOTING.map((item) => `<li>${item}</li>`).join("")}</ul>
              </section>
            </div>
          </div>
        </div>

        <div class="modal-actions pwa-install-modal__actions">
          <button id="pwaInstallDone" type="button" class="blue-button blue-button--tertiary pwa-install-modal__done-button">Close</button>
        </div>
      </div>
    </div>
  `;
}

function buildLauncherCard() {
  return `
    <aside id="pwaInstallLauncher" class="pwa-install-launcher" hidden aria-live="polite">
      <button
        id="pwaInstallDismiss"
        class="pwa-install-launcher__dismiss"
        type="button"
        aria-label="Dismiss install help"
      >
        x
      </button>
      <div class="pwa-install-launcher__eyebrow">App Shortcut</div>
      <div id="pwaInstallLauncherTitle" class="pwa-install-launcher__title">Add this app</div>
      <p id="pwaInstallLauncherBody" class="pwa-install-launcher__body"></p>
      <button id="pwaInstallLauncherAction" class="blue-button pwa-install-launcher__action" type="button">
        How to Add This App
      </button>
    </aside>
  `;
}

function showRelevantPanel(targetKey) {
  sectionTabs.forEach((tab) => {
    const isActive = tab.dataset.target === targetKey;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  sectionPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.target === targetKey);
  });
}

function hideLauncher() {
  if (!launcherCard) return;
  launcherCard.hidden = true;
}

function setHelpExpanded(expanded) {
  helpExpanded = expanded;
  if (!modalOverlay || !installPanels || !installHelpButton) return;

  modalOverlay.classList.toggle("is-help-expanded", expanded);
  installPanels.hidden = !expanded;
  installHelpButton.textContent = expanded ? "Hide Help" : "Help me Install";
}

function shouldShowLauncher(platformState) {
  if (!launcherCard) return false;
  if (platformState.isStandalone) return false;
  return !hasSeenInstallPrompt();
}

function updateInstallUI() {
  if (!installButton || !installStatus || !launcherAction || !launcherTitle || !launcherBody || !installHelpButton) return;

  const platformState = detectPlatform();
  const promptAvailable = canUseInstallPrompt(platformState);
  const manualOnly = isManualOnlyPlatform(platformState);
  const primaryLabel = promptAvailable ? "Install App" : "Help me Install";

  installButton.disabled = false;
  installButton.textContent = primaryLabel;
  launcherAction.textContent = primaryLabel;
  installButton.hidden = !promptAvailable;
  installHelpButton.hidden = false;

  if (platformState.isStandalone) {
    hideLauncher();
    installButton.textContent = "App Installed";
    installButton.disabled = true;
    installHelpButton.hidden = true;
    installStatus.textContent = "This app is already installed and running in app mode on this device.";
    setHelpExpanded(false);
    return;
  }

  if (promptAvailable) {
    launcherTitle.textContent = "Install this app";
    launcherBody.textContent = "Save it like an app on this device for faster access.";
    installStatus.textContent = helpExpanded
      ? "If the install prompt does not appear, use the device-specific steps below."
      : "This browser can install the app directly on this device.";
  } else if (manualOnly) {
    launcherTitle.textContent = "Add this app to your device";
    launcherBody.textContent = "Use the browser menu or Share button to save it to your home screen or dock.";
    installStatus.textContent = "This device uses manual steps. Open help for the short install steps.";
    setHelpExpanded(true);
  } else {
    launcherTitle.textContent = "Add this app to your device";
    launcherBody.textContent = "If install is unavailable right now, the manual steps below still work.";
    installStatus.textContent = "Install is not available right now. Open help for the manual steps.";
  }

  launcherCard.hidden = !shouldShowLauncher(platformState);
}

async function handleInstallAction() {
  const platformState = detectPlatform();
  if (!canUseInstallPrompt(platformState)) {
    setHelpExpanded(true);
    showRelevantPanel(platformState.primary);
    updateInstallUI();
    return;
  }

  setInstallPromptSeen();
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice.catch(() => null);
  deferredInstallPrompt = null;

  if (installStatus) {
    installStatus.textContent = choice?.outcome === "accepted"
      ? "Install accepted. Your browser will finish the setup."
      : "Install was dismissed. You can still use the manual steps below.";
  }

  if (choice?.outcome !== "accepted") {
    setHelpExpanded(true);
    showRelevantPanel(platformState.primary);
  }

  updateInstallUI();
}

function openModal(targetKey = detectPlatform().primary, options = {}) {
  if (!modalOverlay) return;
  const platformState = detectPlatform();
  const expandHelp = options.expandHelp ?? !canUseInstallPrompt(platformState);
  document.body.classList.add("pwa-modal-open");
  modalOverlay.style.display = "flex";
  modalOverlay.setAttribute("aria-hidden", "false");
  setHelpExpanded(expandHelp);
  showRelevantPanel(targetKey);
  updateInstallUI();
}

function closeModal() {
  if (!modalOverlay) return;
  document.body.classList.remove("pwa-modal-open");
  modalOverlay.style.display = "none";
  modalOverlay.setAttribute("aria-hidden", "true");
}

function dismissLauncher() {
  setInstallPromptSeen();
  hideLauncher();
}

function wireSettingsEntryPoint() {
  const installRow = document.getElementById("pwaInstallRow");
  const installBtn = document.getElementById("pwaInstallSettingsBtn");
  const installCopy = document.getElementById("pwaInstallCopy");

  if (installRow) installRow.style.display = "";
  if (installCopy) {
    installCopy.textContent = "Open install and home screen instructions anytime.";
  }

  if (installBtn) {
    installBtn.addEventListener("click", () => {
      openModal(detectPlatform().primary);
    });
  }
}

function injectUI() {
  if (modalOverlay) {
    wireSettingsEntryPoint();
    updateInstallUI();
    return;
  }

  const platformState = detectPlatform();
  document.body.insertAdjacentHTML("beforeend", buildLauncherCard() + buildModal(
    platformState.primary,
    platformState.primary === "desktop" && platformState.isSafari
  ));

  launcherCard = document.getElementById("pwaInstallLauncher");
  launcherTitle = document.getElementById("pwaInstallLauncherTitle");
  launcherBody = document.getElementById("pwaInstallLauncherBody");
  launcherAction = document.getElementById("pwaInstallLauncherAction");
  launcherDismiss = document.getElementById("pwaInstallDismiss");
  installButton = document.getElementById("pwaInstallAction");
  installHelpButton = document.getElementById("pwaInstallHelp");
  installStatus = document.getElementById("pwaInstallStatus");
  installPanels = document.getElementById("pwaInstallPanels");
  modalOverlay = document.getElementById("pwaInstallOverlay");
  sectionTabs = Array.from(document.querySelectorAll(".pwa-install-modal__tab"));
  sectionPanels = Array.from(document.querySelectorAll(".pwa-install-modal__panel"));

  launcherAction?.addEventListener("click", () => {
    setInstallPromptSeen();
    hideLauncher();
    openModal(detectPlatform().primary, { expandHelp: false });
  });

  launcherDismiss?.addEventListener("click", dismissLauncher);

  installButton?.addEventListener("click", () => {
    void handleInstallAction();
  });

  installHelpButton?.addEventListener("click", () => {
    const nextExpanded = !helpExpanded;
    setHelpExpanded(nextExpanded);
    if (nextExpanded) {
      showRelevantPanel(detectPlatform().primary);
    }
    updateInstallUI();
  });
  document.getElementById("pwaInstallDone")?.addEventListener("click", closeModal);
  document.getElementById("pwaInstallClose")?.addEventListener("click", closeModal);

  sectionTabs.forEach((tab) => {
    tab.addEventListener("click", () => showRelevantPanel(tab.dataset.target || detectPlatform().primary));
  });

  modalOverlay?.addEventListener("click", (event) => {
    if (event.target === modalOverlay) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  wireSettingsEntryPoint();
  updateInstallUI();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const protocol = window.location.protocol;
  const isSecureOrigin = protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!isSecureOrigin) return;

  try {
    // Register once at the app root so the same update policy applies to every page.
    const registration = await navigator.serviceWorker.register("./sw.js");

    // Ask the browser for an updated worker when the page loads so shell changes can roll out quickly.
    void registration.update().catch(() => undefined);
  } catch (error) {
    console.warn("[pwa] service worker registration failed", error);
  }
}

window.openPwaInstallHelp = () => {
  openModal(detectPlatform().primary);
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUI();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  setInstallPromptSeen();
  closeModal();
  updateInstallUI();
});

window.addEventListener("pageshow", () => {
  wireSettingsEntryPoint();
  updateInstallUI();
});

async function bootPwaInstall() {
  if (!DISABLED_PATHS.has(getCurrentPage())) {
    await resolveInstallPromptUserId();
    injectUI();
  }
  void registerServiceWorker();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void bootPwaInstall();
  }, { once: true });
} else {
  void bootPwaInstall();
}
