const STORAGE_PREFIX = "aa.tutorial";
const REPLAY_FLAG_KEY = `${STORAGE_PREFIX}.replay`;
const RUN_STATE_PREFIX = `${STORAGE_PREFIX}.run`;
const SEEN_KEY_PREFIX = "tutorial_seen";
const DEFAULT_CARD_WIDTH = 320;
const CARD_MARGIN = 16;
const SPOTLIGHT_PADDING = 10;
const TOOLTIP_GAP = 18;
const SCROLL_WAIT_MS = 220;

export const STUDENT_HOME_TUTORIAL_VERSION = 1;
export const TEACHER_ADMIN_TUTORIAL_VERSION = 1;

export const STUDENT_HOME_TUTORIAL = Object.freeze({
  id: "student-home",
  startPath: "index.html",
  returnPath: "index.html",
  version: STUDENT_HOME_TUTORIAL_VERSION,
  steps: Object.freeze([
    {
      page: "index.html",
      title: "Welcome to Music Amplified",
      body: "Here is a quick tour of the student home screen so you know where everything lives."
    },
    {
      page: "index.html",
      title: "Your Profile",
      body: "This shows which student you’re viewing. If your family has more than one student on the account, you can switch here.",
      target: "#avatarSwitcher"
    },
    {
      page: "index.html",
      title: "Level Badge",
      body: "This is your current level.",
      target: "#levelBadgeImg"
    },
    {
      page: "index.html",
      title: "Level Progress",
      body: "This bar shows how close you are to your next level.",
      target: "#identityProgress .progress-card"
    },
    {
      page: "index.html",
      title: "Log Today’s Practice",
      body: "Tap here to quickly log today’s practice.",
      target: "#quickPracticeBtn",
      interactive: true,
      actionLabel: "Try it now",
      actionEvents: ["aa:tutorial-student-log-today-complete"]
    },
    {
      page: "index.html",
      title: "Log Past Practice",
      body: "Need to log an earlier session? You can log practice from the last 30 days here. Duplicate practice logs are not allowed.",
      target: "#logPastPracticeBtn",
      interactive: true,
      actionLabel: "Try it now",
      actionEvents: ["aa:tutorial-student-log-past-complete"],
      resumeEvents: ["aa:tutorial-student-modal-dismissed"]
    },
    {
      page: "index.html",
      title: "Special Activities",
      body: "Use these buttons to log special activities like classes, performances, festivals, competitions, and more.",
      target: ".action-grid",
      interactive: true,
      actionLabel: "Try it now",
      actionEvents: ["aa:tutorial-student-special-log-complete"],
      resumeEvents: ["aa:tutorial-student-modal-dismissed"]
    },
    {
      page: "index.html",
      title: "Badge Progress",
      body: "This section shows your most recent badge and the next badge you’re working toward.",
      target: ".student-badges-panel",
      interactive: true,
      actionLabel: "Try it now",
      resumeEvents: ["aa:tutorial-badge-hero-dismissed"]
    },
    {
      page: "index.html",
      title: "Teacher Challenges",
      body: "Teacher challenges will appear here when your teacher assigns them.",
      target: () => findVisibleElement([
        "#studentChallengesNoticeMount .student-challenges-notice-banner",
        "#studentChallengesSubtleMount .student-challenges-pill-link",
        "#studentChallengesSubtleMount .student-challenges-subtle-link",
        "#studentChallengesNoticeMount",
        "#studentChallengesSubtleMount",
        "#studentLoggingControls"
      ]),
      interactive: true,
      actionLabel: "Try it now",
      resumeEvents: ["aa:tutorial-student-challenges-dismissed"]
    },
    {
      page: "index.html",
      title: "Leaderboard",
      body: "See how your progress compares with other students.",
      target: '[data-nav-href="leaderboard.html"]'
    },
    {
      page: "index.html",
      title: "My Points",
      body: "View your points, categories, and activity history.",
      target: '[data-nav-href="my-points.html"]'
    },
    {
      page: "index.html",
      title: "Settings",
      body: "Manage your account and family settings here.",
      target: '[data-nav-href="settings.html"]'
    },
    {
      page: "index.html",
      title: "You’re all set!",
      body: "You can come back to this tutorial later from Settings any time."
    }
  ])
});

export const TEACHER_ADMIN_TUTORIAL = Object.freeze({
  id: "teacher-admin",
  startPath: "index.html",
  returnPath: "index.html",
  version: TEACHER_ADMIN_TUTORIAL_VERSION,
  steps: Object.freeze([
    {
      page: "index.html",
      title: "Welcome to Music Amplified (Teacher View)",
      body: "This is where you track student progress, review logs, and assign challenges."
    },
    {
      page: "index.html",
      title: "Teacher/Admin View",
      body: "This shows you’re in teacher view. From here, you can manage logs and challenges for your students.",
      target: "#viewModeToggle"
    },
    {
      page: "index.html",
      title: "Quick Log",
      body: "Quickly log points for students here. Select students, choose a category, add points, and submit.",
      target: "#staffQuickLogForm",
      highlightTarget: () => findVisibleElement([
        "#staffQuickLogForm .quicklog-header-row",
        "#staffStudentPicker",
        "#staffQuickLogForm .ql-category-pop",
        "#staffQuickLogForm"
      ]),
      interactive: true,
      actionLabel: "Try it now",
      actionEvents: ["aa:tutorial-staff-quick-log-complete"]
    },
    {
      page: "index.html",
      title: "Challenges",
      body: "Create challenges to motivate students. You can assign them to your whole studio or specific students.",
      target: "#staffChallengesRibbonStrip"
    },
    {
      page: "index.html",
      title: "Create a Challenge",
      body: "Set a goal, assign points, choose who it's for, and set a time frame.",
      target: "#createChallengeOverlay .staff-challenge-modal",
      beforeShow: async () => {
        const trigger = document.getElementById("btnNewChallenge");
        if (trigger instanceof HTMLElement) trigger.click();
        await wait(SCROLL_WAIT_MS);
      },
      interactive: true,
      actionLabel: "Try it now",
      actionEvents: ["aa:tutorial-staff-challenge-created"],
      resumeEvents: ["aa:tutorial-staff-challenge-dismissed"],
      afterHide: () => {
        const close = document.getElementById("createChallengeCloseBtn") || document.getElementById("challengeCancelBtn");
        if (close instanceof HTMLElement) close.click();
      }
    },
    {
      page: "review-logs.html",
      title: "Review Logs",
      body: "Review and approve student logs here. You can edit points, update categories, or request more info.",
      target: () => findVisibleElement([
        "#logsWrapper #logsTableBody tr",
        "#logsWrapper #logsTable thead",
        "#logsWrapper #logsTable",
        "#logsWrapper"
      ]),
      highlightTarget: () => findVisibleElement([
        "#logsWrapper #logsTableBody tr",
        "#logsWrapper #logsTable thead",
        "#logsWrapper #logsTable",
        ".filter-toolbar",
        "#categorySummary .summary-card"
      ])
    },
    {
      page: "review-logs.html",
      title: "Notifications",
      body: "Open Notifications to see major student milestones, like level-ups and other important progress moments.",
      target: "#showNotificationsBtn"
    },
    {
      page: "review-logs.html",
      title: "Track Real-World Recognition",
      body: "When a student reaches a major milestone, use this section to track recognition. Check the box once it’s awarded, and use the note field to record what was given or when it was awarded. This helps connect app milestones to real-world recognition like wristbands, recital awards, certificates, prizes, or other celebrations.",
      target: () => findVisibleElement([
        ".review-notification-item .review-notification-recognition",
        ".review-notification-item",
        ".review-notification-list"
      ]),
      beforeShow: async () => {
        const trigger = document.getElementById("showNotificationsBtn");
        if (trigger instanceof HTMLElement) trigger.click();
        await wait(SCROLL_WAIT_MS);
      },
      interactive: true,
      actionLabel: "Try it now",
      actionEvents: ["aa:tutorial-staff-recognition-complete"],
      afterHide: () => {
        const showLogsBtn = document.getElementById("showLogsBtn");
        if (showLogsBtn instanceof HTMLElement) showLogsBtn.click();
      }
    },
    {
      page: "review-logs.html",
      title: "Status Controls",
      body: "Approve logs or mark them as needing more information.",
      target: ".status-select",
      beforeShow: async () => {
        const showLogsBtn = document.getElementById("showLogsBtn");
        if (showLogsBtn instanceof HTMLElement) showLogsBtn.click();
        await wait(120);
      }
    },
    {
      page: "review-logs.html",
      title: "Review Logs",
      body: "This takes you to the full review system for managing student logs.",
      target: '[data-nav-href="review-logs.html"]'
    },
    {
      page: "review-logs.html",
      title: "Leaderboard",
      body: "View how students rank and track overall progress.",
      target: '[data-nav-href="leaderboard.html"]'
    },
    {
      page: "review-logs.html",
      title: "Settings",
      body: "Manage your account, family, and studio settings here.",
      target: '[data-nav-href="settings.html"]'
    },
    {
      page: "studio-settings-hub.html",
      title: "Studio Settings",
      body: "This is where you manage your studio, users, and settings.",
      target: () => findVisibleElement([
        '#studioSections .accordion-card[data-section="manage-users"] .accordion-header',
        '#studioSections .accordion-card[data-section="manage-users"]',
        "#studioSections"
      ]),
      highlightTarget: () => findVisibleElement([
        '#studioSections .accordion-card[data-section="manage-users"]',
        '#studioSections .accordion-card[data-section="manage-users"] .accordion-header',
        "#studioSections"
      ])
    },
    {
      page: "studio-settings-hub.html",
      title: "You’re ready to go",
      body: "You can now log activity, review progress, and guide your students."
    }
  ])
});

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function raf() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function getCurrentPageName() {
  const raw = window.location.pathname || "";
  return (raw.split("/").pop() || "index.html").toLowerCase();
}

function isVisibleElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findVisibleElement(selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const candidate of list) {
    if (typeof candidate === "function") {
      const result = candidate();
      if (isVisibleElement(result)) return result;
      continue;
    }
    if (candidate instanceof HTMLElement && isVisibleElement(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const element = document.querySelector(candidate);
      if (isVisibleElement(element)) return element;
    }
  }
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function rectsOverlap(a, b, gap = 0) {
  if (!a || !b) return false;
  return !(
    a.right <= (b.left - gap) ||
    a.left >= (b.right + gap) ||
    a.bottom <= (b.top - gap) ||
    a.top >= (b.bottom + gap)
  );
}

function buildCompletionKey(tutorialId, profileId) {
  const id = String(profileId || "anonymous").trim() || "anonymous";
  return `${STORAGE_PREFIX}.${tutorialId}.${id}`;
}

function buildSeenKey(userId) {
  const id = String(userId || "").trim();
  return id ? `${SEEN_KEY_PREFIX}_${id}` : null;
}

function buildRunStateKey(tutorialId, profileId) {
  const id = String(profileId || "anonymous").trim() || "anonymous";
  return `${RUN_STATE_PREFIX}.${tutorialId}.${id}`;
}

function readStorage(key, kind = "local") {
  try {
    const store = kind === "session" ? sessionStorage : localStorage;
    return store.getItem(key);
  } catch (error) {
    console.warn("[Tutorial] failed reading storage", error);
    return null;
  }
}

function writeStorage(key, value, kind = "local") {
  try {
    const store = kind === "session" ? sessionStorage : localStorage;
    store.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("[Tutorial] failed writing storage", error);
    return false;
  }
}

function removeStorage(key, kind = "local") {
  try {
    const store = kind === "session" ? sessionStorage : localStorage;
    store.removeItem(key);
  } catch (error) {
    console.warn("[Tutorial] failed removing storage", error);
  }
}

export function requestStudentTutorialReplay(tutorialId = STUDENT_HOME_TUTORIAL.id) {
  writeStorage(REPLAY_FLAG_KEY, String(tutorialId || ""), "session");
}

export function requestTeacherAdminTutorialReplay(tutorialId = TEACHER_ADMIN_TUTORIAL.id) {
  writeStorage(REPLAY_FLAG_KEY, String(tutorialId || ""), "session");
}

function consumeReplayFlag(tutorialId) {
  const value = readStorage(REPLAY_FLAG_KEY, "session");
  if (value !== String(tutorialId || "")) return false;
  removeStorage(REPLAY_FLAG_KEY, "session");
  return true;
}

class LocalTutorialStore {
  async hasSeen(userId) {
    const key = buildSeenKey(userId);
    if (!key) return false;
    return readStorage(key, "local") === "1";
  }

  async setSeen(userId) {
    const key = buildSeenKey(userId);
    if (!key) return false;
    return writeStorage(key, "1", "local");
  }

  async getVersion(tutorialId, profileId) {
    const raw = readStorage(buildCompletionKey(tutorialId, profileId), "local");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async setVersion(tutorialId, profileId, version) {
    writeStorage(buildCompletionKey(tutorialId, profileId), String(version), "local");
  }
}

class TutorialManager {
  constructor({ config, userId, profileId, store, onClose } = {}) {
    this.config = config;
    this.userId = userId || profileId || null;
    this.profileId = profileId;
    this.store = store || new LocalTutorialStore();
    this.onClose = typeof onClose === "function" ? onClose : null;
    this.index = 0;
    this.isOpen = false;
    this.activeTarget = null;
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  get steps() {
    return Array.isArray(this.config?.steps) ? this.config.steps : [];
  }

  get runStateKey() {
    return buildRunStateKey(this.config?.id, this.profileId);
  }

  async maybeStart({ startOnlyOnStartPath = false } = {}) {
    const forceReplay = consumeReplayFlag(this.config?.id);
    const runState = this.readRunState();
    const hasSeen = await this.hasSeenTutorial();
    const shouldStart = forceReplay || Boolean(runState) || !hasSeen;
    if (!shouldStart) return false;

    if (!runState && startOnlyOnStartPath && getCurrentPageName() !== String(this.config?.startPath || "").toLowerCase()) {
      return false;
    }

    return this.start({ force: true, index: runState?.index ?? 0 });
  }

  async start({ force = false, index = 0 } = {}) {
    if (this.isOpen) {
      await this.showStep(this.index);
      return true;
    }

    if (!force) {
      if (await this.hasSeenTutorial()) return false;
    }

    if (!this.steps.length) return false;
    this.mount();
    this.isOpen = true;
    document.body.classList.add("student-tutorial-open");
    document.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("scroll", this.handleResize, true);
    await this.showStep(index);
    return true;
  }

  readRunState() {
    const raw = readStorage(this.runStateKey, "session");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const index = Number(parsed?.index);
      if (!Number.isFinite(index)) return null;
      return { index };
    } catch {
      return null;
    }
  }

  persistRunState(index) {
    writeStorage(this.runStateKey, JSON.stringify({ index }), "session");
  }

  clearRunState() {
    removeStorage(this.runStateKey, "session");
  }

  resolveTarget(target) {
    if (typeof target === "function") {
      const value = target();
      return isVisibleElement(value) ? value : null;
    }
    return findVisibleElement(target);
  }

  resolveStepTargets(step) {
    const interactionTarget = step?.target ? this.resolveTarget(step.target) : null;
    const highlightTarget = step?.highlightTarget ? this.resolveTarget(step.highlightTarget) : interactionTarget;
    return {
      interactionTarget,
      highlightTarget: highlightTarget || interactionTarget
    };
  }

  mount() {
    if (this.root instanceof HTMLElement) return;

    const root = document.createElement("div");
    root.className = "student-tutorial";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="student-tutorial__overlay student-tutorial__overlay--top"></div>
      <div class="student-tutorial__overlay student-tutorial__overlay--left"></div>
      <div class="student-tutorial__overlay student-tutorial__overlay--right"></div>
      <div class="student-tutorial__overlay student-tutorial__overlay--bottom"></div>
      <div class="student-tutorial__spotlight" aria-hidden="true"></div>
      <section class="student-tutorial__card" role="dialog" aria-modal="true" aria-live="polite">
        <div class="student-tutorial__eyebrow"></div>
        <h3 class="student-tutorial__title"></h3>
        <p class="student-tutorial__body"></p>
        <div class="student-tutorial__actions">
          <button type="button" class="student-tutorial__ghost" data-action="skip">Skip</button>
          <div class="student-tutorial__nav">
            <button type="button" class="student-tutorial__ghost" data-action="try" hidden>Try it now</button>
            <button type="button" class="student-tutorial__ghost" data-action="back">Back</button>
            <button type="button" class="student-tutorial__primary" data-action="next">Next</button>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(root);

    this.root = root;
    this.overlayTop = root.querySelector(".student-tutorial__overlay--top");
    this.overlayLeft = root.querySelector(".student-tutorial__overlay--left");
    this.overlayRight = root.querySelector(".student-tutorial__overlay--right");
    this.overlayBottom = root.querySelector(".student-tutorial__overlay--bottom");
    this.spotlight = root.querySelector(".student-tutorial__spotlight");
    this.card = root.querySelector(".student-tutorial__card");
    this.eyebrow = root.querySelector(".student-tutorial__eyebrow");
    this.title = root.querySelector(".student-tutorial__title");
    this.body = root.querySelector(".student-tutorial__body");
    this.backButton = root.querySelector('[data-action="back"]');
    this.nextButton = root.querySelector('[data-action="next"]');
    this.skipButton = root.querySelector('[data-action="skip"]');
    this.tryButton = root.querySelector('[data-action="try"]');

    this.backButton?.addEventListener("click", () => this.goBack());
    this.nextButton?.addEventListener("click", () => this.goNext());
    this.skipButton?.addEventListener("click", () => this.skip());
    this.tryButton?.addEventListener("click", () => this.pauseInteractiveStep());
  }

  async showStep(nextIndex) {
    this.clearInteractiveBindings();
    this.index = clamp(nextIndex, 0, this.steps.length - 1);
    const step = this.steps[this.index];
    if (!step) {
      await this.finish();
      return;
    }

    const targetPage = String(step.page || this.config?.startPath || "index.html").toLowerCase();
    if (targetPage !== getCurrentPageName()) {
      this.persistRunState(this.index);
      this.navigateToStepPage(targetPage);
      return;
    }

    if (typeof step.beforeShow === "function") {
      try {
        await step.beforeShow();
      } catch (error) {
        console.warn("[Tutorial] beforeShow failed", error);
      }
    }

    const { interactionTarget, highlightTarget } = this.resolveStepTargets(step);
    if (step?.target && !interactionTarget && !highlightTarget) {
      if (typeof step.afterHide === "function") {
        try {
          step.afterHide();
        } catch (error) {
          console.warn("[Tutorial] afterHide failed", error);
        }
      }
      if (this.index >= this.steps.length - 1) {
        await this.finish();
        return;
      }
      await this.showStep(this.index + 1);
      return;
    }

    const stepAnchor = interactionTarget || highlightTarget;
    if (stepAnchor) {
      stepAnchor.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      await wait(SCROLL_WAIT_MS);
    }

    this.activeTarget?.classList.remove("student-tutorial-target");
    this.activeTarget = highlightTarget || null;
    this.activeTarget?.classList.add("student-tutorial-target");

    this.root?.setAttribute("aria-hidden", "false");
    this.eyebrow.textContent = `Step ${this.index + 1} of ${this.steps.length}`;
    this.title.textContent = step?.title || "";
    this.body.textContent = step?.body || "";
    this.backButton.disabled = this.index === 0;
    this.nextButton.textContent = this.index === this.steps.length - 1 ? "Finish" : "Next";
    if (this.tryButton instanceof HTMLElement) {
      const isInteractive = Boolean(step?.interactive && Array.isArray(step?.actionEvents) && step.actionEvents.length);
      this.tryButton.hidden = !isInteractive;
      this.tryButton.textContent = step?.actionLabel || "Try it now";
    }
    this.root?.classList.remove("is-paused");

    await raf();
    this.positionUI(highlightTarget);
    if (step?.interactive && (interactionTarget || highlightTarget)) {
      this.bindInteractiveTarget(interactionTarget || highlightTarget, step);
    }
    this.clearRunState();
  }

  bindInteractiveTarget(targetElement, step) {
    if (!(targetElement instanceof HTMLElement) || !step?.interactive) return;
    this.interactiveTarget = targetElement;
    this.interactiveTargetHandler = () => {
      this.pauseInteractiveStep();
    };
    targetElement.addEventListener("pointerdown", this.interactiveTargetHandler, true);
    targetElement.addEventListener("focusin", this.interactiveTargetHandler, true);
  }

  clearInteractiveBindings() {
    if (this.interactiveTarget instanceof HTMLElement && this.interactiveTargetHandler) {
      this.interactiveTarget.removeEventListener("pointerdown", this.interactiveTargetHandler, true);
      this.interactiveTarget.removeEventListener("focusin", this.interactiveTargetHandler, true);
    }
    this.interactiveTarget = null;
    this.interactiveTargetHandler = null;
    if (Array.isArray(this.interactiveEventBindings)) {
      this.interactiveEventBindings.forEach(({ eventName, handler }) => {
        window.removeEventListener(eventName, handler);
      });
    }
    this.interactiveEventBindings = [];
  }

  pauseInteractiveStep() {
    const step = this.steps[this.index];
    if (!step?.interactive || this.root?.classList.contains("is-paused")) return;
    this.activeTarget?.classList.remove("student-tutorial-target");
    this.root?.classList.add("is-paused");
    this.clearInteractiveBindings();
    const events = Array.isArray(step?.actionEvents) ? step.actionEvents : [];
      this.interactiveEventBindings = events.map((eventName) => {
        const handler = async () => {
          this.clearInteractiveBindings();
          this.root?.classList.remove("is-paused");
          this.activeTarget?.classList.add("student-tutorial-target");
          await this.goNext();
        };
        window.addEventListener(eventName, handler, { once: true });
        return { eventName, handler };
      });
    const resumeEvents = Array.isArray(step?.resumeEvents) ? step.resumeEvents : [];
    resumeEvents.forEach((eventName) => {
      const handler = async () => {
        this.clearInteractiveBindings();
        this.root?.classList.remove("is-paused");
        this.activeTarget?.classList.add("student-tutorial-target");
        await this.showStep(this.index);
      };
      window.addEventListener(eventName, handler, { once: true });
      this.interactiveEventBindings.push({ eventName, handler });
    });
  }

  resumeInteractiveStep() {
    this.root?.classList.remove("is-paused");
    this.activeTarget?.classList.add("student-tutorial-target");
    const step = this.steps[this.index];
    if (step?.interactive && this.activeTarget instanceof HTMLElement) {
      this.bindInteractiveTarget(this.activeTarget, step);
    }
  }

  navigateToStepPage(targetPage) {
    this.close({ preserveRunState: true });
    window.location.href = targetPage;
  }

  navigateAfterTutorial() {
    const returnPath = String(this.config?.returnPath || this.config?.startPath || "").toLowerCase();
    if (!returnPath) return;
    if (getCurrentPageName() === returnPath) return;
    window.location.href = returnPath;
  }

  positionUI(targetElement) {
    if (!(this.card instanceof HTMLElement) || !(this.spotlight instanceof HTMLElement)) return;

    this.card.style.maxWidth = `${Math.min(DEFAULT_CARD_WIDTH, window.innerWidth - (CARD_MARGIN * 2))}px`;
    this.card.style.left = `${CARD_MARGIN}px`;
    this.card.style.top = `${CARD_MARGIN}px`;
    this.card.style.bottom = "auto";

    if (!targetElement) {
      this.spotlight.style.opacity = "0";
      this.positionOverlayPanes(null);
      this.card.style.left = "50%";
      this.card.style.top = "50%";
      this.card.style.bottom = "auto";
      this.card.style.transform = "translate(-50%, -50%)";
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const paddedRect = {
      top: Math.max(CARD_MARGIN, rect.top - SPOTLIGHT_PADDING),
      left: Math.max(CARD_MARGIN, rect.left - SPOTLIGHT_PADDING),
      width: Math.min(window.innerWidth - (CARD_MARGIN * 2), rect.width + (SPOTLIGHT_PADDING * 2)),
      height: Math.min(window.innerHeight - (CARD_MARGIN * 2), rect.height + (SPOTLIGHT_PADDING * 2))
    };
    paddedRect.bottom = paddedRect.top + paddedRect.height;

    this.spotlight.style.opacity = "1";
    this.spotlight.style.left = `${paddedRect.left}px`;
    this.spotlight.style.top = `${paddedRect.top}px`;
    this.spotlight.style.width = `${paddedRect.width}px`;
    this.spotlight.style.height = `${paddedRect.height}px`;
    this.positionOverlayPanes(paddedRect);

    const dockCardToEdge = (preferTop = false) => {
      this.card.style.transform = "none";
      this.card.style.left = `${CARD_MARGIN}px`;
      this.card.style.right = `${CARD_MARGIN}px`;
      this.card.style.top = preferTop ? `${Math.max(12, CARD_MARGIN)}px` : "auto";
      this.card.style.bottom = preferTop ? "auto" : `${Math.max(12, CARD_MARGIN)}px`;
      this.card.style.maxWidth = `${window.innerWidth - (CARD_MARGIN * 2)}px`;
    };

    const useMobileSheet = window.innerWidth <= 640 || window.innerHeight <= 760;
    if (useMobileSheet) {
      const placeAtTop = paddedRect.bottom > (window.innerHeight * 0.58);
      dockCardToEdge(placeAtTop);
      return;
    }

    const cardRect = this.card.getBoundingClientRect();
    const roomBelow = window.innerHeight - paddedRect.bottom - CARD_MARGIN;
    const roomAbove = paddedRect.top - CARD_MARGIN;
    const insufficientVerticalRoom = Math.max(roomAbove, roomBelow) < (cardRect.height + TOOLTIP_GAP);
    const preferTopDock = paddedRect.bottom > (window.innerHeight * 0.58);

    if (window.innerWidth <= 900 && insufficientVerticalRoom) {
      dockCardToEdge(preferTopDock);
      return;
    }

    const placeBelow = roomBelow >= cardRect.height + TOOLTIP_GAP || roomBelow >= roomAbove;
    const top = placeBelow
      ? Math.min(window.innerHeight - cardRect.height - CARD_MARGIN, paddedRect.bottom + TOOLTIP_GAP)
      : Math.max(CARD_MARGIN, paddedRect.top - cardRect.height - TOOLTIP_GAP);
    const centeredLeft = paddedRect.left + (paddedRect.width / 2) - (cardRect.width / 2);
    const left = clamp(centeredLeft, CARD_MARGIN, window.innerWidth - cardRect.width - CARD_MARGIN);

    this.card.style.transform = "none";
    this.card.style.right = "auto";
    this.card.style.left = `${left}px`;
    this.card.style.top = `${top}px`;

    const placedCardRect = this.card.getBoundingClientRect();
    if (window.innerWidth <= 900 && rectsOverlap(placedCardRect, paddedRect, 12)) {
      dockCardToEdge(preferTopDock);
    }
  }

  positionOverlayPanes(rect) {
    const panes = [this.overlayTop, this.overlayLeft, this.overlayRight, this.overlayBottom];
    if (panes.some((pane) => !(pane instanceof HTMLElement))) return;

    if (!rect) {
      this.overlayTop.style.left = "0";
      this.overlayTop.style.top = "0";
      this.overlayTop.style.width = "100vw";
      this.overlayTop.style.height = "100vh";
      this.overlayLeft.style.width = "0";
      this.overlayLeft.style.height = "0";
      this.overlayRight.style.width = "0";
      this.overlayRight.style.height = "0";
      this.overlayBottom.style.width = "0";
      this.overlayBottom.style.height = "0";
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = Math.max(0, rect.top);
    const left = Math.max(0, rect.left);
    const right = Math.min(vw, rect.left + rect.width);
    const bottom = Math.min(vh, rect.top + rect.height);

    this.overlayTop.style.left = "0";
    this.overlayTop.style.top = "0";
    this.overlayTop.style.width = `${vw}px`;
    this.overlayTop.style.height = `${top}px`;

    this.overlayLeft.style.left = "0";
    this.overlayLeft.style.top = `${top}px`;
    this.overlayLeft.style.width = `${left}px`;
    this.overlayLeft.style.height = `${Math.max(0, bottom - top)}px`;

    this.overlayRight.style.left = `${right}px`;
    this.overlayRight.style.top = `${top}px`;
    this.overlayRight.style.width = `${Math.max(0, vw - right)}px`;
    this.overlayRight.style.height = `${Math.max(0, bottom - top)}px`;

    this.overlayBottom.style.left = "0";
    this.overlayBottom.style.top = `${bottom}px`;
    this.overlayBottom.style.width = `${vw}px`;
    this.overlayBottom.style.height = `${Math.max(0, vh - bottom)}px`;
  }

  async goBack() {
    if (this.index <= 0) return;
    const step = this.steps[this.index];
    if (typeof step?.afterHide === "function") {
      try {
        step.afterHide();
      } catch (error) {
        console.warn("[Tutorial] afterHide failed", error);
      }
    }
    await this.showStep(this.index - 1);
  }

  async goNext() {
    const step = this.steps[this.index];
    if (typeof step?.afterHide === "function") {
      try {
        step.afterHide();
      } catch (error) {
        console.warn("[Tutorial] afterHide failed", error);
      }
    }
    if (this.index >= this.steps.length - 1) {
      await this.finish();
      return;
    }
    await this.showStep(this.index + 1);
  }

  async skip() {
    await this.markComplete();
    this.clearRunState();
    this.close();
    this.navigateAfterTutorial();
  }

  async finish() {
    await this.markComplete();
    this.clearRunState();
    this.close();
    this.navigateAfterTutorial();
  }

  async markComplete() {
    try {
      await this.store.setSeen(this.userId);
      await this.store.setVersion(this.config?.id, this.profileId, this.config?.version);
    } catch (error) {
      console.warn("[Tutorial] failed saving completion state", error);
    }
  }

  async hasSeenTutorial() {
    try {
      if (await this.store.hasSeen(this.userId)) return true;

      // Backward compatibility: honor the previous per-tutorial completion key
      // and promote it to the new per-user seen flag.
      const currentVersion = await this.store.getVersion(this.config?.id, this.profileId);
      if (currentVersion === this.config?.version) {
        await this.store.setSeen(this.userId);
        return true;
      }
    } catch (error) {
      console.warn("[Tutorial] failed reading seen state", error);
    }
    return false;
  }

  handleKeydown(event) {
    if (!this.isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.skip();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      this.goNext();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.goBack();
    }
  }

  handleResize() {
    if (!this.isOpen) return;
    this.positionUI(this.activeTarget);
  }

  close({ preserveRunState = false } = {}) {
    this.isOpen = false;
    this.clearInteractiveBindings();
    this.activeTarget?.classList.remove("student-tutorial-target");
    this.activeTarget = null;
    if (!preserveRunState) this.clearRunState();
    document.body.classList.remove("student-tutorial-open");
    document.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("scroll", this.handleResize, true);
    if (this.root instanceof HTMLElement) {
      this.root.remove();
    }
    this.root = null;
    this.card = null;
    this.spotlight = null;
    if (this.onClose) this.onClose();
  }
}

export function createStudentHomeTutorial(options = {}) {
  return new TutorialManager({
    config: STUDENT_HOME_TUTORIAL,
    ...options
  });
}

export function createTeacherAdminTutorial(options = {}) {
  return new TutorialManager({
    config: TEACHER_ADMIN_TUTORIAL,
    ...options
  });
}
