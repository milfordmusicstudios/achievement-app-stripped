import { supabase } from "./supabaseClient.js";
import { getAccessFlags, getViewerContext } from "./utils.js";
import { createTeacherAdminTutorial } from "./student-tutorial.js";

const PANEL_URLS = {
  "manage-users": "manage-users.html"
};

const DEFAULT_STUDIO_LOGO = "images/logos/amplified.png";

function normalizeRoles(raw) {
  if (Array.isArray(raw)) {
    return raw.map(role => String(role || "").trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      return normalizeRoles(JSON.parse(trimmed));
    } catch {
      return [trimmed.toLowerCase()];
    }
  }
  return [];
}

function uniqueRoles(...roleGroups) {
  return Array.from(new Set(roleGroups.flatMap(normalizeRoles)));
}

function serializeQueryError(error) {
  if (!error) return null;
  return {
    message: error.message || String(error),
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null
  };
}

async function loadStudioMembershipRoles(authUserId, studioId) {
  if (!authUserId || !studioId) {
    return { roles: [], error: null, row: null };
  }

  const { data, error } = await supabase
    .from("studio_members")
    .select("roles")
    .eq("user_id", authUserId)
    .eq("studio_id", studioId)
    .maybeSingle();

  return {
    roles: normalizeRoles(data?.roles),
    error,
    row: data || null
  };
}

function logRedirect(reason, details) {
  console.warn("[StudioSettings] redirecting:", reason, {
    authUserId: details.authUserId || null,
    activeStudioId: details.studioId || null,
    userRoles: details.userRoles || [],
    studioMembershipRoles: details.membershipRoles || [],
    accessFlags: details.access || null,
    queryErrors: {
      authUser: serializeQueryError(details.authUserError),
      studioMembership: serializeQueryError(details.membershipError),
      studio: serializeQueryError(details.studioError)
    },
    condition: details.condition || {}
  });
}

function toggleInviteModal(open) {
  const modal = document.getElementById("inviteUserModal");
  if (!modal) return;
  modal.classList.toggle("is-open", Boolean(open));
  modal.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    const emailField = modal.querySelector("#inviteEmail");
    emailField?.focus();
  }
}

function setupInviteModal() {
  const modal = document.getElementById("inviteUserModal");
  if (!modal) return;
  const openBtn = document.getElementById("inviteUserOpenBtn");
  const closeBtn = document.getElementById("inviteUserCloseBtn");
  openBtn?.addEventListener("click", () => toggleInviteModal(true));
  closeBtn?.addEventListener("click", () => toggleInviteModal(false));
  modal.addEventListener("click", event => {
    if (event.target === modal) {
      toggleInviteModal(false);
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      toggleInviteModal(false);
    }
  });
}

function renderManageUsersOwnerNoticeCard(manageUsersCard) {
  if (!manageUsersCard) return;
  const parent = manageUsersCard.parentElement;
  if (!parent) return;

  const cardId = "manageUsersOwnerNoticeCard";
  if (parent.querySelector(`#${cardId}`)) return;

  const card = document.createElement("div");
  card.id = cardId;
  card.className = "settings-card manage-users-owner-note-card";
  card.innerHTML = `
    <div class="manage-users-owner-note-title">Manage Users Access</div>
    <p class="manage-users-owner-note-copy">You can manage users here. Other studio settings are handled by the studio owner.</p>
  `;

  manageUsersCard.insertAdjacentElement("afterend", card);
}

function extractEmbedHTML(fullHTML) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHTML, "text/html");
  const embedRoot = doc.querySelector("[data-embed-root]");
  if (!embedRoot) {
    return {
      html: "",
      hasEmbedRoot: false
    };
  }
  const clone = embedRoot.cloneNode(true);
  clone?.querySelectorAll("script").forEach(el => el.remove());
  clone?.classList.add("is-embedded");

  return {
    html: clone ? clone.outerHTML : "",
    hasEmbedRoot: true
  };
}

async function ensurePanelLoaded(sectionId) {
  const target = document.getElementById(`panel-${sectionId}`);
  if (!target || target.dataset.loaded === "true") return;
  const panelPath = PANEL_URLS[sectionId];
  if (!panelPath) return;
  const cacheBustedUrl =
    panelPath +
    (panelPath.includes("?") ? "&" : "?") +
    "v=" +
    Date.now();
  try {
    const res = await fetch(cacheBustedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${cacheBustedUrl}`);
    const html = await res.text();
    const embedResult = extractEmbedHTML(html);
    if (!embedResult.hasEmbedRoot) {
      target.innerHTML = `<div class="embed-error">No <code>data-embed-root</code> found in ${panelPath}</div>`;
      return;
    }
    target.innerHTML = embedResult.html;
    target.dataset.loaded = "true";
    if (sectionId === "manage-users" && typeof window.initManageUsersPanel === "function") {
      window.initManageUsersPanel();
    }
  } catch (err) {
    console.error(`[Studio] failed to load panel ${sectionId}`, err);
    target.textContent = "Failed to load content.";
  }
}

function closeAllSections(exceptId) {
  document.querySelectorAll(".accordion-card").forEach(card => {
    const header = card.querySelector(".accordion-header");
    const body = card.querySelector(".accordion-body");
    if (card.dataset.section === exceptId) return;
    header?.setAttribute("aria-expanded", "false");
    body?.setAttribute("hidden", "");
    card.classList.remove("is-open");
  });
}

async function toggleSection(card) {
  const sectionId = card.dataset.section;
  const header = card.querySelector(".accordion-header");
  const body = card.querySelector(".accordion-body");
  const expanded = header?.getAttribute("aria-expanded") === "true";
  if (expanded) {
    header?.setAttribute("aria-expanded", "false");
    body?.setAttribute("hidden", "");
    card.classList.remove("is-open");
    return;
  }
  closeAllSections(sectionId);
  header?.setAttribute("aria-expanded", "true");
  body?.removeAttribute("hidden");
  card.classList.add("is-open");
  await ensurePanelLoaded(sectionId);
}

document.addEventListener("DOMContentLoaded", async () => {
  const accessNotice = document.getElementById("studioAccessNotice");
  const sections = document.getElementById("studioSections");
  const nameEl = document.getElementById("studioName");
  const logoEl = document.getElementById("studioLogo");
  const manageUsersCard = document.querySelector('.accordion-card[data-section="manage-users"]');

  // Prevent admin-tool flicker until permission checks complete.
  if (sections) sections.style.display = "none";
  if (accessNotice) {
    accessNotice.style.display = "";
    accessNotice.textContent = "Checking access...";
  }
  if (logoEl) {
    logoEl.src = DEFAULT_STUDIO_LOGO;
  }

  const viewerContext = await getViewerContext();
  const { data: authData, error: authUserError } = await supabase.auth.getUser();
  const authUserId = authData?.user?.id || viewerContext?.viewerUserId || null;

  const access = await getAccessFlags({ force: true });
  const studioId = viewerContext?.studioId || access?.studio_id || localStorage.getItem("activeStudioId");
  const membershipResult = await loadStudioMembershipRoles(authUserId, studioId);
  const userRoles = uniqueRoles(viewerContext?.accountRoles, viewerContext?.viewerRoles);
  const membershipRoles = membershipResult.roles;
  const staffRoles = new Set(["admin", "teacher"]);
  const hasMembershipStaffRole = membershipRoles.some(role => staffRoles.has(role));
  const hasViewerContextStaffRole =
    String(viewerContext?.studioId || "") === String(studioId || "") &&
    (Boolean(viewerContext?.accountIsAdmin) || Boolean(viewerContext?.accountIsTeacher));
  const hasTeacherAdminAccess = hasMembershipStaffRole || hasViewerContextStaffRole;
  const canOpenStudioSettings = Boolean(
    access?.is_owner ||
    access?.can_manage_users ||
    hasTeacherAdminAccess
  );
  const redirectContext = {
    authUserId,
    studioId,
    userRoles,
    membershipRoles,
    access,
    authUserError,
    membershipError: membershipResult.error
  };

  if (viewerContext?.isStudent) {
    logRedirect("active profile is student", {
      ...redirectContext,
      condition: {
        viewerContextIsStudent: Boolean(viewerContext?.isStudent)
      }
    });
    window.location.replace("settings-security.html");
    return;
  }

  const tutorialUserId = viewerContext?.viewerUserId || viewerContext?.activeProfileId || null;
  const teacherAdminTutorial = createTeacherAdminTutorial({
    userId: tutorialUserId,
    profileId: tutorialUserId
  });

  if (!studioId) {
    logRedirect("studio id missing", {
      ...redirectContext,
      condition: {
        missingStudioId: !studioId
      }
    });
    window.location.replace("index.html");
    return;
  }

  if (!access?.is_owner) {
    if (canOpenStudioSettings) {
      console.warn("[StudioSettings] limited mode: non-owner staff/manage-users access", {
        authUserId,
        activeStudioId: studioId,
        userRoles,
        studioMembershipRoles: membershipRoles,
        accessFlags: access,
        condition: {
          isOwner: Boolean(access?.is_owner),
          canManageUsers: Boolean(access?.can_manage_users),
          hasTeacherAdminAccess
        }
      });
      document.querySelectorAll(".accordion-card").forEach(card => {
        if (card.dataset.section !== "manage-users") card.remove();
      });
      if (!manageUsersCard) {
        logRedirect("manage-users section missing", {
          ...redirectContext,
          condition: {
            isOwner: Boolean(access?.is_owner),
            canManageUsers: Boolean(access?.can_manage_users),
            hasTeacherAdminAccess,
            manageUsersCardPresent: Boolean(manageUsersCard)
          }
        });
        window.location.replace("manage-users.html");
        return;
      }
      renderManageUsersOwnerNoticeCard(manageUsersCard);
      if (accessNotice) accessNotice.style.display = "none";
    } else {
      logRedirect("insufficient permissions", {
        ...redirectContext,
        condition: {
          isOwner: Boolean(access?.is_owner),
          canManageUsers: Boolean(access?.can_manage_users),
          hasTeacherAdminAccess,
          hasMembershipStaffRole,
          hasViewerContextStaffRole,
          canOpenStudioSettings
        }
      });
      window.location.replace("index.html");
      return;
    }
  } else if (accessNotice) {
    accessNotice.style.display = "none";
  }

  if (sections) sections.style.display = "";
  void teacherAdminTutorial.maybeStart();

  const { data: studio, error } = await supabase
    .from("studios")
    .select("name, slug")
    .eq("id", studioId)
    .single();

  if (error) {
    console.error("[StudioSettings] load failed", error);
    return;
  }

  if (nameEl) nameEl.textContent = studio?.name || "—";
  if (logoEl) {
    logoEl.alt = studio?.name ? `${studio.name} logo` : "Studio logo";
  }

  setupInviteModal();

  document.querySelectorAll(".accordion-card").forEach(card => {
    const header = card.querySelector(".accordion-header");
    if (header) {
      header.addEventListener("click", () => toggleSection(card));
    }
  });
});
