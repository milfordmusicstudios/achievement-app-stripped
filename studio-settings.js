import { supabase } from "./supabaseClient.js";
import { getViewerContext, getAuthUserId, getActiveStudioIdForUser } from "./utils.js";

const PANEL_URLS = {
  "manage-users": "manage-users.html",
  "invite-student": "invite-student.html"
};

const DEFAULT_STUDIO_LOGO = "images/logos/logo.png";

function extractEmbedHTML(fullHTML) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHTML, "text/html");
  const root =
    doc.querySelector("[data-embed-root]") ||
    doc.querySelector("main") ||
    doc.querySelector(".embed-root") ||
    doc.querySelector(".settings-embed") ||
    doc.body;
  console.log(
    "[studio-settings] embed root found:",
    root ? root.tagName : "NONE",
    root?.getAttribute?.("data-embed-root")
  );
  const clone = root ? root.cloneNode(true) : null;
  clone?.querySelectorAll("script").forEach(el => el.remove());
  return clone ? clone.innerHTML : fullHTML;
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
    console.log("[studio-settings] fetched bytes:", html.length, "panel:", sectionId);
    target.innerHTML = extractEmbedHTML(html);
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
  const logoEl = document.getElementById("studioLogo");
  if (logoEl) {
    logoEl.src = DEFAULT_STUDIO_LOGO;
  }

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
  if (logoEl) {
    logoEl.alt = studio?.name ? `${studio.name} logo` : "Studio logo";
  }

  document.querySelectorAll(".accordion-card").forEach(card => {
    const header = card.querySelector(".accordion-header");
    if (header) {
      header.addEventListener("click", () => toggleSection(card));
    }
  });
});




