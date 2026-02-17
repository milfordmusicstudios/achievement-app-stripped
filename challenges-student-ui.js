import { supabase } from "./supabaseClient.js";
import { fetchMyChallengeAssignments, updateAssignmentStatus } from "./challenges-api.js";

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
  if (status === "new") return "New";
  if (status === "active") return "Active";
  if (status === "completed") return "Completed";
  if (status === "dismissed") return "Dismissed";
  return status || "Unknown";
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
}

export async function initStudentChallengesUI({ studioId, user, roles, showToast }) {
  const noticeMount = document.getElementById("studentChallengesNoticeMount");
  const subtleMount = document.getElementById("studentChallengesSubtleMount");
  if (!noticeMount || !subtleMount) return;

  const studio = String(studioId || "").trim();
  const isStudent = Array.isArray(roles) && roles.map(r => String(r || "").toLowerCase()).includes("student");
  if (!studio || !user?.id || !isStudent) {
    noticeMount.innerHTML = "";
    subtleMount.innerHTML = "";
    return;
  }

  ensureStudentChallengeModals();

  const listOverlay = document.getElementById("studentChallengesListOverlay");
  const detailOverlay = document.getElementById("studentChallengeDetailOverlay");
  const listClose = document.getElementById("studentChallengesListClose");
  const detailClose = document.getElementById("studentChallengeDetailClose");
  const tabsEl = document.getElementById("studentChallengesTabs");
  const listEl = document.getElementById("studentChallengesList");
  const detailBody = document.getElementById("studentChallengeDetailBody");

  let assignments = [];
  let usersById = new Map();
  let activeTab = "new";

  const setListOpen = (open) => {
    if (listOverlay) listOverlay.style.display = open ? "flex" : "none";
  };

  const setDetailOpen = (open) => {
    if (detailOverlay) detailOverlay.style.display = open ? "flex" : "none";
  };

  const derive = () => {
    const today = localToday();
    const mapped = assignments.map(row => {
      const challenge = row.teacher_challenges || {};
      const start = String(challenge.start_date || "");
      const end = String(challenge.end_date || "");
      const status = String(row.status || "");
      const inWindow = !!start && !!end && today >= start && today <= end;
      const expired = !!end && today > end && (status === "new" || status === "active" || status === "dismissed");
      return { ...row, challenge, start, end, status, inWindow, expired, today };
    });

    const buckets = {
      new: mapped.filter(entry => entry.status === "new" && entry.inWindow && entry.today >= entry.start),
      active: mapped.filter(entry => entry.status === "active" && entry.inWindow),
      completed: mapped.filter(entry => entry.status === "completed"),
      dismissed: mapped.filter(entry => entry.status === "dismissed"),
      expired: mapped.filter(entry => entry.expired)
    };
    return { mapped, buckets };
  };

  const renderHomeSurface = () => {
    const { buckets } = derive();
    const newCount = buckets.new.length;
    const activeCount = buckets.active.length;
    const completedCount = buckets.completed.length;

    if (newCount > 0) {
      noticeMount.innerHTML = `
        <button id="studentChallengesNoticeBtn" type="button" class="student-challenges-notice-card">
          You have ${newCount} new Teacher Challenges! Tap to view.
        </button>
      `;
      subtleMount.innerHTML = "";
      const btn = document.getElementById("studentChallengesNoticeBtn");
      btn?.addEventListener("click", () => {
        activeTab = "new";
        renderListModal();
        setListOpen(true);
      });
      return;
    }

    noticeMount.innerHTML = "";
    if (activeCount > 0) {
      subtleMount.innerHTML = `<button id="studentChallengesSubtleBtn" type="button" class="student-challenges-subtle-link">Active challenges (${activeCount})</button>`;
      document.getElementById("studentChallengesSubtleBtn")?.addEventListener("click", () => {
        activeTab = "active";
        renderListModal();
        setListOpen(true);
      });
      return;
    }

    if (completedCount > 0) {
      subtleMount.innerHTML = `<button id="studentChallengesSubtleBtn" type="button" class="student-challenges-subtle-link">Completed challenges (${completedCount})</button>`;
      document.getElementById("studentChallengesSubtleBtn")?.addEventListener("click", () => {
        activeTab = "completed";
        renderListModal();
        setListOpen(true);
      });
      return;
    }

    subtleMount.innerHTML = "";
  };

  const getTabRows = () => {
    const { buckets } = derive();
    return [
      { key: "new", label: "New", rows: buckets.new },
      { key: "active", label: "Active", rows: buckets.active },
      { key: "completed", label: "Completed", rows: buckets.completed },
      { key: "dismissed", label: "Dismissed", rows: buckets.dismissed },
      { key: "expired", label: "Expired", rows: buckets.expired }
    ];
  };

  const renderListModal = () => {
    if (!tabsEl || !listEl) return;
    const tabRows = getTabRows();
    if (!tabRows.some(tab => tab.key === activeTab)) activeTab = "new";

    tabsEl.innerHTML = tabRows.map(tab => `
      <button
        type="button"
        class="student-challenges-tab ${tab.key === activeTab ? "is-active" : ""}"
        data-tab="${tab.key}"
      >
        ${tab.label} (${tab.rows.length})
      </button>
    `).join("");

    const current = tabRows.find(tab => tab.key === activeTab) || tabRows[0];
    if (!current.rows.length) {
      listEl.innerHTML = `<div class="student-challenge-empty">No challenges in this tab.</div>`;
    } else {
      listEl.innerHTML = current.rows.map(row => `
        <button type="button" class="student-challenge-row" data-assignment-id="${row.id}">
          <div class="student-challenge-row-top">
            <div class="student-challenge-title">${String(row.challenge.title || "Untitled challenge")}</div>
            <span class="student-challenge-badge ${row.expired ? "is-expired" : ""}">${row.expired ? "Expired" : badgeText(row.status)}</span>
          </div>
          <div class="student-challenge-meta">${Number(row.challenge.points || 0)} points</div>
          <div class="student-challenge-meta">Ends ${toDateText(row.end)}</div>
        </button>
      `).join("");
    }

    tabsEl.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeTab = String(btn.getAttribute("data-tab") || "new");
        renderListModal();
      });
    });

    listEl.querySelectorAll("[data-assignment-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = String(btn.getAttribute("data-assignment-id") || "");
        const row = assignments.find(entry => String(entry.id) === id);
        if (!row) return;
        setListOpen(false);
        renderDetailModal(row);
        setDetailOpen(true);
      });
    });
  };

  const refreshAll = async () => {
    assignments = await fetchMyChallengeAssignments(studio);
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

  const doStatusUpdate = async (assignmentId, nextStatus, successMessage) => {
    await updateAssignmentStatus(assignmentId, nextStatus);
    if (typeof showToast === "function") showToast(successMessage);
    setDetailOpen(false);
    await refreshAll();
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
    const isNew = row.status === "new";
    const isActive = row.status === "active";
    const isDismissed = row.status === "dismissed";
    const canReactivate = isDismissed && row.inWindow && row.today >= row.start;
    const canAccept = isNew && !isExpired && row.today >= row.start && row.today <= row.end;
    const canDismiss = isNew && !isExpired;
    const canComplete = isActive && !isExpired;

    detailBody.innerHTML = `
      <div class="student-challenge-detail">
        <h3>${String(challenge.title || "Untitled challenge")}</h3>
        <div class="student-challenge-meta">${Number(challenge.points || 0)} points</div>
        <div class="student-challenge-meta">${toDateText(row.start)} to ${toDateText(row.end)}</div>
        <div class="student-challenge-meta">Teacher: ${teacherName}</div>
        <p>${String(challenge.description || "No instructions provided.")}</p>
        ${isExpired ? '<div class="student-challenge-status-note">Expired</div>' : ""}
        ${isCompleted ? `<div class="student-challenge-status-note">Completed ${String(row.completed_at || "").replace("T", " ").slice(0, 16)}</div>` : ""}
        <div class="modal-actions">
          <button id="challengeDetailBackBtn" type="button" class="blue-button">Back</button>
          ${canAccept ? '<button id="challengeDetailAcceptBtn" type="button" class="blue-button">Accept</button>' : ""}
          ${canDismiss ? '<button id="challengeDetailDismissBtn" type="button" class="blue-button btn-ghost">Decline & dismiss</button>' : ""}
          ${canComplete ? '<button id="challengeDetailCompleteBtn" type="button" class="blue-button">Mark complete</button>' : ""}
          ${isDismissed ? `<button id="challengeDetailReactivateBtn" type="button" class="blue-button"${canReactivate ? "" : " disabled"}>Reactivate</button>` : ""}
        </div>
      </div>
    `;

    detailBody.querySelector("#challengeDetailBackBtn")?.addEventListener("click", () => {
      setDetailOpen(false);
      renderListModal();
      setListOpen(true);
    });
    detailBody.querySelector("#challengeDetailAcceptBtn")?.addEventListener("click", () => {
      doStatusUpdate(row.id, "active", "Challenge accepted");
    });
    detailBody.querySelector("#challengeDetailDismissBtn")?.addEventListener("click", () => {
      doStatusUpdate(row.id, "dismissed", "Challenge dismissed");
    });
    detailBody.querySelector("#challengeDetailCompleteBtn")?.addEventListener("click", () => {
      doStatusUpdate(row.id, "completed", "Challenge completed!");
    });
    detailBody.querySelector("#challengeDetailReactivateBtn")?.addEventListener("click", () => {
      if (!canReactivate) return;
      doStatusUpdate(row.id, "new", "Challenge reactivated");
    });
  };

  listClose?.addEventListener("click", () => setListOpen(false));
  detailClose?.addEventListener("click", () => setDetailOpen(false));
  listOverlay?.addEventListener("click", event => {
    if (event.target === listOverlay) setListOpen(false);
  });
  detailOverlay?.addEventListener("click", event => {
    if (event.target === detailOverlay) setDetailOpen(false);
  });

  try {
    await refreshAll();
  } catch (error) {
    console.error("[StudentChallenges] failed to initialize", error);
    if (typeof showToast === "function") showToast("Couldn't load challenges.");
  }
}
