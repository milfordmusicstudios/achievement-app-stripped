import { supabase } from "./supabaseClient.js";
import { completeChallengeAndCreateLog, ensureFirstPracticeChallengeAssignment, fetchMyChallengeAssignments, updateAssignmentStatus } from "./challenges-api.js";

const NEW_BANNER_SEEN_KEY = "studentChallengesNewBannerSeen";
const NEW_BANNER_OPENED_KEY = "studentChallengesNewBannerOpened";
const dispatchTutorialAction = (action) => {
  if (!action) return;
  window.dispatchEvent(new CustomEvent(String(action)));
};

function localToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDateText(value) {
  return String(value || "");
}

function badgeText(status) {
  if (status === "new" || status === "dismissed") return "Inactive";
  if (status === "active") return "Active";
  if (status === "completed_pending") return "Pending approval";
  if (status === "pending_review" || status === "pending") return "Pending approval";
  if (status === "completed") return "Completed";
  return status || "Unknown";
}

function badgeClass(row) {
  if (row?.expired) return "is-expired";
  if (row?.status === "completed_pending" || row?.status === "pending_review" || row?.status === "pending") return "is-pending";
  if (row?.status === "completed") return "is-completed";
  return "";
}

function setStudentChallengeToggleVisual(button, isActive) {
  if (!(button instanceof HTMLElement)) return;
  const textEl = button.querySelector(".student-challenge-switch-text");
  if (textEl) textEl.textContent = isActive ? "Active" : "Inactive";
  button.classList.toggle("is-active", isActive);
  button.classList.toggle("is-inactive", !isActive);
  button.setAttribute("aria-pressed", isActive ? "true" : "false");
  button.setAttribute("aria-label", `Set challenge ${isActive ? "inactive" : "active"}`);
  button.setAttribute("data-next-status", isActive ? "dismissed" : "active");
  button.setAttribute("data-state-label", isActive ? "Active" : "Inactive");
}

function ensureStudentChallengeModals() {
  if (!document.getElementById("studentChallengesListOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "studentChallengesListOverlay";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="modal student-challenges-modal">
        <div class="modal-header">
          <div class="modal-title">Teacher Challenges</div>
          <button id="studentChallengesListClose" class="modal-close" type="button">x</button>
        </div>
        <div class="modal-body">
          <div id="studentChallengesTabs" class="student-challenges-tabs"></div>
          <div id="studentChallengesList" class="student-challenges-list"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  if (!document.getElementById("studentChallengeDetailOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "studentChallengeDetailOverlay";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="modal student-challenges-modal">
        <div class="modal-header">
          <div class="modal-title">Challenge</div>
          <button id="studentChallengeDetailClose" class="modal-close" type="button">x</button>
        </div>
        <div id="studentChallengeDetailBody" class="modal-body"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  if (!document.getElementById("studentChallengeCompleteOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "studentChallengeCompleteOverlay";
    overlay.className = "modal-overlay";
    overlay.style.display = "none";
    overlay.innerHTML = `
      <div class="modal student-challenges-modal">
        <div class="modal-header">
          <div class="modal-title">Challenge Completed!</div>
          <button id="studentChallengeCompleteClose" class="modal-close" type="button">x</button>
        </div>
        <div class="modal-body">
          <div class="modal-field">
            <label>Challenge</label>
            <input id="studentChallengeCompleteTitle" type="text" readonly />
          </div>
          <div class="challenge-date-row">
            <div class="modal-field">
              <label>Date</label>
              <input id="studentChallengeCompleteDate" type="date" />
            </div>
            <div class="modal-field">
              <label>Points</label>
              <input id="studentChallengeCompletePoints" type="text" readonly />
            </div>
          </div>
          <div class="modal-field">
            <label for="studentChallengeCompleteNote">Note (required)</label>
            <textarea id="studentChallengeCompleteNote" rows="3" placeholder="What did you complete?"></textarea>
          </div>
          <div id="studentChallengeCompleteError" class="staff-msg" style="display:none;"></div>
          <div class="modal-actions">
            <button id="studentChallengeCompleteCancel" type="button" class="blue-button">Cancel</button>
            <button id="studentChallengeCompleteSubmit" type="button" class="blue-button">Submit Log</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
}

export async function initStudentChallengesUI({ studioId, studentId, roles, showToast }) {
  const noticeMount = document.getElementById("studentChallengesNoticeMount");
  const subtleMount = document.getElementById("studentChallengesSubtleMount");
  if (!noticeMount || !subtleMount) return;

  const studio = String(studioId || "").trim();
  const targetStudentId = String(studentId || "").trim();
  const isStudent = Array.isArray(roles) && roles.map(r => String(r || "").toLowerCase()).includes("student");
  if (!studio || !isStudent) {
    noticeMount.innerHTML = "";
    subtleMount.innerHTML = "";
    return;
  }
  if (!targetStudentId) {
    console.error("[StudentChallengesUI] missing studentId");
    if (typeof showToast === "function") showToast("No student selected.");
    noticeMount.innerHTML = "";
    subtleMount.innerHTML = "";
    return;
  }

  ensureStudentChallengeModals();

  const listOverlay = document.getElementById("studentChallengesListOverlay");
  const detailOverlay = document.getElementById("studentChallengeDetailOverlay");
  const completeOverlay = document.getElementById("studentChallengeCompleteOverlay");
  const listClose = document.getElementById("studentChallengesListClose");
  const detailClose = document.getElementById("studentChallengeDetailClose");
  const completeClose = document.getElementById("studentChallengeCompleteClose");
  const tabsEl = document.getElementById("studentChallengesTabs");
  const listEl = document.getElementById("studentChallengesList");
  const detailBody = document.getElementById("studentChallengeDetailBody");
  const completeTitleInput = document.getElementById("studentChallengeCompleteTitle");
  const completeDateInput = document.getElementById("studentChallengeCompleteDate");
  const completePointsInput = document.getElementById("studentChallengeCompletePoints");
  const completeNoteInput = document.getElementById("studentChallengeCompleteNote");
  const completeErrorEl = document.getElementById("studentChallengeCompleteError");
  const completeCancelBtn = document.getElementById("studentChallengeCompleteCancel");
  const completeSubmitBtn = document.getElementById("studentChallengeCompleteSubmit");

  let assignments = [];
  let usersById = new Map();
  let activeTab = "current";
  let selectedCompletionAssignmentId = "";

  const setListOpen = (open) => {
    if (listOverlay) listOverlay.style.display = open ? "flex" : "none";
    if (!open) dispatchTutorialAction("aa:tutorial-student-challenges-dismissed");
  };

  const setDetailOpen = (open) => {
    if (detailOverlay) detailOverlay.style.display = open ? "flex" : "none";
    if (!open) dispatchTutorialAction("aa:tutorial-student-challenges-dismissed");
  };

  const setCompleteOpen = (open) => {
    if (completeOverlay) completeOverlay.style.display = open ? "flex" : "none";
    if (!open) dispatchTutorialAction("aa:tutorial-student-challenges-dismissed");
  };

  const setCompletionError = (message) => {
    if (!completeErrorEl) return;
    const text = String(message || "").trim();
    completeErrorEl.textContent = text;
    completeErrorEl.style.display = text ? "block" : "none";
  };

  const derive = () => {
    const today = localToday();
    const mapped = assignments.map(row => {
      const challenge = row.teacher_challenges || {};
      const start = String(challenge.start_date || "");
      const end = String(challenge.end_date || "");
      const status = String(row.status || "");
      const inWindow = !!start && !!end && today >= start && today <= end;
      const endedByDate = !!end && today > end;
      const endedByTeacher = challenge?.is_active === false;
      const challengeEnded = endedByDate || endedByTeacher;
      const expired = challengeEnded && (status === "new" || status === "active" || status === "dismissed");
      return { ...row, challenge, start, end, status, inWindow, challengeEnded, expired, today };
    });

    const completed = mapped.filter(entry => entry.status === "completed" || entry.status === "completed_pending" || entry.status === "pending_review" || entry.status === "pending");
    const current = mapped.filter(entry =>
      (entry.status === "new" || entry.status === "active" || entry.status === "dismissed") &&
      entry.inWindow &&
      !entry.expired
    );
    const newVisible = mapped.filter(entry => entry.status === "new" && entry.inWindow && entry.today >= entry.start);
    const activeVisible = mapped.filter(entry => entry.status === "active" && entry.inWindow);
    const expired = mapped.filter(entry => entry.expired);
    return { mapped, buckets: { current, completed, expired, newVisible, activeVisible } };
  };

  const markNewBannerOpened = () => {
    sessionStorage.setItem(NEW_BANNER_OPENED_KEY, "1");
  };

  const openListAt = (tabKey) => {
    activeTab = tabKey;
    markNewBannerOpened();
    renderListModal();
    renderHomeSurface();
    setListOpen(true);
  };

  const renderHomeSurface = () => {
    const { buckets } = derive();
    const newCount = buckets.newVisible.length;
    const activeCount = buckets.activeVisible.length;
    const completedCount = buckets.completed.length;
    const formatCountLabel = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

    if (newCount > 0) {
      const shouldAnimate = !sessionStorage.getItem(NEW_BANNER_SEEN_KEY);
      const wasOpened = !!sessionStorage.getItem(NEW_BANNER_OPENED_KEY);
      sessionStorage.setItem(NEW_BANNER_SEEN_KEY, "1");
      noticeMount.innerHTML = `
        <button id="studentChallengesNoticeBtn" type="button" class="student-challenges-notice-banner${shouldAnimate ? " is-enter" : ""}${wasOpened ? " is-soft" : ""}">
          <span class="student-challenges-notice-title">&#10024; You have ${newCount} NEW Teacher Challenges!</span>
          <span class="student-challenges-notice-subtext">Tap to view.</span>
        </button>
      `;
      subtleMount.innerHTML = "";
      document.getElementById("studentChallengesNoticeBtn")?.addEventListener("click", () => openListAt("current"));
      return;
    }

    noticeMount.innerHTML = `<div class="student-challenges-notice-spacer" aria-hidden="true"></div>`;
    if (activeCount > 0) {
      subtleMount.innerHTML = `<button id="studentChallengesSubtleBtn" type="button" class="student-challenges-pill-link">${formatCountLabel(activeCount, "Active Challenge", "Active Challenges")}</button>`;
      document.getElementById("studentChallengesSubtleBtn")?.addEventListener("click", () => openListAt("current"));
      return;
    }

    if (completedCount > 0) {
      subtleMount.innerHTML = `<button id="studentChallengesSubtleBtn" type="button" class="student-challenges-subtle-link">Completed challenges (${completedCount})</button>`;
      document.getElementById("studentChallengesSubtleBtn")?.addEventListener("click", () => openListAt("completed"));
      return;
    }

    subtleMount.innerHTML = "";
  };

  const getTabRows = () => {
    const { buckets } = derive();
    return [
      { key: "current", label: "Current", rows: buckets.current },
      { key: "completed", label: "Completed", rows: buckets.completed },
      { key: "expired", label: "Expired", rows: buckets.expired }
    ];
  };

  const renderListModal = () => {
    if (!tabsEl || !listEl) return;
    const tabRows = getTabRows();
    if (!tabRows.some(tab => tab.key === activeTab)) activeTab = "current";

    tabsEl.innerHTML = tabRows.map(tab => `
      <button
        type="button"
        class="student-challenges-tab ${tab.key === activeTab ? "is-active" : ""}"
        data-tab="${tab.key}"
      >
        ${tab.label} (${tab.rows.length})
      </button>
    `).join("");

    const currentTab = tabRows.find(tab => tab.key === activeTab) || tabRows[0];
    if (!currentTab.rows.length) {
      listEl.innerHTML = `<div class="student-challenge-empty">No challenges in this tab.</div>`;
    } else {
      listEl.innerHTML = currentTab.rows.map(row => {
        const isCurrent = currentTab.key === "current";
        const isActiveRow = row.status === "active";
        const pendingStatus = row.status === "completed_pending" || row.status === "pending_review" || row.status === "pending";
        const statusLabel = pendingStatus && row.challengeEnded ? "Challenge ended" : badgeText(row.status);
        return `
          <div class="student-challenge-row" data-assignment-id="${row.id}">
            <div class="student-challenge-row-top">
              <div class="student-challenge-title">${String(row.challenge.title || "Untitled challenge")}</div>
              ${isCurrent
                ? `<button
                    type="button"
                    class="student-challenge-switch ${isActiveRow ? "is-active" : "is-inactive"}"
                    data-toggle-assignment-id="${row.id}"
                    data-next-status="${isActiveRow ? "dismissed" : "active"}"
                    aria-label="Set challenge ${isActiveRow ? "inactive" : "active"}"
                    aria-pressed="${isActiveRow ? "true" : "false"}"
                    data-state-label="${isActiveRow ? "Active" : "Inactive"}"
                  ><span class="student-challenge-switch-thumb" aria-hidden="true"></span><span class="student-challenge-switch-text">${isActiveRow ? "Active" : "Inactive"}</span></button>`
                : `<span class="student-challenge-badge ${badgeClass(row)}">${row.expired ? "Expired" : statusLabel}</span>`}
            </div>
            <div class="student-challenge-meta">${Number(row.challenge.points || 0)} points</div>
            <div class="student-challenge-meta">Ends ${toDateText(row.end)}</div>
            ${isCurrent && isActiveRow
              ? `<div class="student-challenge-row-actions">
                  <button
                    type="button"
                    class="blue-button"
                    data-complete-assignment-id="${row.id}"
                  >Challenge Completed!</button>
                </div>`
              : ""}
          </div>
        `;
      }).join("");
    }

    tabsEl.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeTab = String(btn.getAttribute("data-tab") || "current");
        renderListModal();
      });
    });

    listEl.querySelectorAll("[data-toggle-assignment-id]").forEach(btn => {
      btn.addEventListener("click", async event => {
        event.stopPropagation();
        const id = String(btn.getAttribute("data-toggle-assignment-id") || "");
        const nextStatus = String(btn.getAttribute("data-next-status") || "");
        const row = assignments.find(entry => String(entry.id) === id);
        if (!row || !nextStatus) return;
        const wasActive = String(row.status || "") === "active";
        setStudentChallengeToggleVisual(btn, !wasActive);
        try {
          if (String(row.status || "") === "dismissed" && nextStatus === "active") {
            await updateAssignmentStatus(id, "new");
          }
          await updateAssignmentStatus(id, nextStatus);
          row.status = nextStatus;
          await refreshAll();
          renderListModal();
          setListOpen(true);
        } catch (error) {
          setStudentChallengeToggleVisual(btn, wasActive);
          console.error("[StudentChallenges] toggle failed", error);
          if (typeof showToast === "function") showToast("Couldn't update challenge status.");
        }
      });
    });

    listEl.querySelectorAll("[data-assignment-id]").forEach(rowEl => {
      rowEl.addEventListener("click", event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".student-challenge-switch")) return;
        if (target?.closest("[data-complete-assignment-id]")) return;
        const id = String(rowEl.getAttribute("data-assignment-id") || "");
        const row = assignments.find(entry => String(entry.id) === id);
        if (!row) return;
        setListOpen(false);
        renderDetailModal(row);
        setDetailOpen(true);
      });
    });

    listEl.querySelectorAll("[data-complete-assignment-id]").forEach(btn => {
      btn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const assignmentId = String(btn.getAttribute("data-complete-assignment-id") || "");
        const row = assignments.find(entry => String(entry.id) === assignmentId);
        if (!row) return;
        openCompletionModal(row);
      });
    });
  };

  const refreshAll = async () => {
    assignments = await fetchMyChallengeAssignments(studio, targetStudentId);
    const { buckets } = derive();
    console.log("[StudentChallengesUI] counts", {
      total: assignments.length,
      newVisible: buckets.newVisible.length,
      activeVisible: buckets.activeVisible.length,
      current: buckets.current.length,
      completed: buckets.completed.length,
      expired: buckets.expired.length
    });

    const creatorIds = Array.from(new Set(
      assignments
        .map(row => row?.teacher_challenges?.created_by)
        .filter(Boolean)
        .map(String)
    ));
    if (creatorIds.length) {
      const { data } = await supabase
        .from("users")
        .select("id, firstName, lastName")
        .in("id", creatorIds);
      usersById = new Map((Array.isArray(data) ? data : []).map(u => [String(u.id), u]));
    } else {
      usersById = new Map();
    }

    renderHomeSurface();
    if (listOverlay?.style.display === "flex") renderListModal();
  };

  const ensureAutomaticChallenges = async () => {
    try {
      const assignmentId = await ensureFirstPracticeChallengeAssignment(studio, targetStudentId);
      console.log("[StudentChallengesUI] first practice auto challenge", {
        studioId: studio,
        studentId: targetStudentId,
        assignmentId
      });
    } catch (error) {
      console.error("[StudentChallengesUI] first practice auto challenge failed", error);
    }
  };

  const renderDetailModal = (raw) => {
    if (!detailBody) return;
    const { mapped } = derive();
    const row = mapped.find(entry => String(entry.id) === String(raw.id));
    if (!row) {
      detailBody.innerHTML = `<div class="student-challenge-empty">Challenge not found.</div>`;
      return;
    }

    const challenge = row.challenge;
    const creator = usersById.get(String(challenge.created_by || ""));
    const teacherName = creator ? `${creator.firstName || ""} ${creator.lastName || ""}`.trim() || "Teacher" : "Teacher";
    const isExpired = row.expired;
    const isCompleted = row.status === "completed";
    const isPendingReview = row.status === "completed_pending" || row.status === "pending_review" || row.status === "pending";
    const isActive = row.status === "active" && !isExpired;

    detailBody.innerHTML = `
      <div class="student-challenge-detail">
        <h3>${String(challenge.title || "Untitled challenge")}</h3>
        <div class="student-challenge-meta">${Number(challenge.points || 0)} points</div>
        <div class="student-challenge-meta">${toDateText(row.start)} to ${toDateText(row.end)}</div>
        <div class="student-challenge-meta">Teacher: ${teacherName}</div>
        <p>${String(challenge.description || "No instructions provided.")}</p>
        ${isExpired ? '<div class="student-challenge-status-note">Expired</div>' : ""}
        ${isCompleted ? `<div class="student-challenge-status-note">Completed ${String(row.completed_at || "").replace("T", " ").slice(0, 16)}</div>` : ""}
        ${isPendingReview ? `<div class="student-challenge-status-note">${row.challengeEnded ? "Challenge ended" : "Pending teacher approval"}</div>` : ""}
        <div class="modal-actions">
          ${isActive ? '<button id="challengeDetailCompleteBtn" type="button" class="blue-button">Challenge Completed!</button>' : ""}
          <button id="challengeDetailBackBtn" type="button" class="blue-button">Back</button>
        </div>
      </div>
    `;

    detailBody.querySelector("#challengeDetailCompleteBtn")?.addEventListener("click", () => {
      openCompletionModal(row);
    });
    detailBody.querySelector("#challengeDetailBackBtn")?.addEventListener("click", () => {
      setDetailOpen(false);
      renderListModal();
      setListOpen(true);
    });
  };

  const openCompletionModal = (raw) => {
    const { mapped } = derive();
    const row = mapped.find(entry => String(entry.id) === String(raw?.id || ""));
    if (!row) return;
    if (row.status !== "active" || row.expired) {
      if (typeof showToast === "function") showToast("Only active challenges can be submitted.");
      return;
    }
    selectedCompletionAssignmentId = String(row.id || "");
    if (completeTitleInput) completeTitleInput.value = String(row.challenge?.title || "Challenge");
    if (completeDateInput) completeDateInput.value = localToday();
    if (completePointsInput) completePointsInput.value = `${Number(row.challenge?.points || 0)} points`;
    if (completeNoteInput) completeNoteInput.value = "";
    setCompletionError("");
    setCompleteOpen(true);
    completeNoteInput?.focus();
  };

  const submitCompletion = async () => {
    const assignmentId = String(selectedCompletionAssignmentId || "").trim();
    const row = assignments.find(entry => String(entry.id) === assignmentId);
    if (!assignmentId || !row) return;
    const challengeTitle = String(row?.teacher_challenges?.title || "Challenge").trim();
    const note = String(completeNoteInput?.value || "").trim();
    const selectedDate = String(completeDateInput?.value || "").slice(0, 10) || localToday();
    if (!note) {
      setCompletionError("Please add a note before submitting.");
      return;
    }

    if (completeSubmitBtn) {
      completeSubmitBtn.disabled = true;
      completeSubmitBtn.textContent = "Submitting...";
    }
    setCompletionError("");

    try {
      const logId = await completeChallengeAndCreateLog(assignmentId, targetStudentId, selectedDate);
      const logNote = `Teacher Challenge: ${challengeTitle} - ${note}`;
      const { error: updateErr } = await supabase
        .from("logs")
        .update({ notes: logNote })
        .eq("id", logId)
        .eq("userId", targetStudentId);
      if (updateErr) throw updateErr;

      await refreshAll();
      renderListModal();
      setCompleteOpen(false);
      setDetailOpen(false);
      setListOpen(true);
      selectedCompletionAssignmentId = "";
      if (typeof showToast === "function") showToast("Challenge completion submitted.");
    } catch (error) {
      console.error("[StudentChallenges] completion submit failed", error);
      const rawMessage = String(error?.message || "");
      if (rawMessage.toLowerCase().includes("only active assignments")) {
        setCompletionError("Challenge must be active before you can submit it.");
      } else {
        setCompletionError(rawMessage || "Couldn't submit challenge completion.");
      }
    } finally {
      if (completeSubmitBtn) {
        completeSubmitBtn.disabled = false;
        completeSubmitBtn.textContent = "Submit Log";
      }
    }
  };

  listClose?.addEventListener("click", () => setListOpen(false));
  detailClose?.addEventListener("click", () => setDetailOpen(false));
  completeClose?.addEventListener("click", () => setCompleteOpen(false));
  completeCancelBtn?.addEventListener("click", () => setCompleteOpen(false));
  completeSubmitBtn?.addEventListener("click", () => {
    void submitCompletion();
  });
  completeNoteInput?.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void submitCompletion();
  });
  listOverlay?.addEventListener("click", event => {
    if (event.target === listOverlay) setListOpen(false);
  });
  detailOverlay?.addEventListener("click", event => {
    if (event.target === detailOverlay) setDetailOpen(false);
  });
  completeOverlay?.addEventListener("click", event => {
    if (event.target === completeOverlay) setCompleteOpen(false);
  });

  try {
    await ensureAutomaticChallenges();
    await refreshAll();
  } catch (error) {
    console.error("[StudentChallenges] failed to initialize", error);
    if (typeof showToast === "function") showToast("Couldn't load challenges.");
  }
}
