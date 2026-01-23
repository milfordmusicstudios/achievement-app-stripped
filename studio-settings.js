import { supabase } from "./supabaseClient.js";
import { getViewerContext, getAuthUserId, getActiveStudioIdForUser } from "./utils.js";

const PANEL_URLS = {
  "manage-users": "manage-users.html",
  "invite-student": "invite-student.html",
  "invite-staff": "invite-staff.html"
};

const CLEAN_SELECTORS = [
  ".bottom-nav",
  "nav",
  ".app-footer",
  "footer",
  ".env-badge",
  "[data-env-badge]",
  "#bottomNav",
  "#envBadge",
  "#appNav",
  "#pageHeader"
];

async function ensurePanelLoaded(sectionId) {
  const target = document.getElementById(`panel-${sectionId}`);
  if (!target || target.dataset.loaded === "true") return;
  const url = PANEL_URLS[sectionId];
  if (!url) return;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}`);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    CLEAN_SELECTORS.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    });
    const mainContent = doc.querySelector("main.app") || doc.body;
    target.innerHTML = mainContent ? mainContent.innerHTML : html;
    target.dataset.loaded = "true";
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
  const slugEl = document.getElementById("studioSlug");

  const viewerContext = await getViewerContext();
  const roles = viewerContext?.viewerRoles || [];
  const isAdmin = roles.includes("admin");

  if (!isAdmin) {
    if (accessNotice) accessNotice.style.display = "";
    if (sections) sections.style.display = "none";
    return;
  }

  if (accessNotice) accessNotice.style.display = "none";
  if (sections) sections.style.display = "";

  const authUserId = await getAuthUserId();
  const studioId = viewerContext?.studioId || await getActiveStudioIdForUser(authUserId);
  if (!studioId) {
    console.warn("[StudioSettings] studio id missing");
    return;
  }

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
  if (slugEl) slugEl.textContent = studio?.slug || "—";

  document.querySelectorAll(".accordion-card").forEach(card => {
    const header = card.querySelector(".accordion-header");
    if (header) {
      header.addEventListener("click", () => toggleSection(card));
    }
  });
});
