import { supabase } from "./supabaseClient.js";
import { getViewerContext, getAuthUserId, getActiveStudioIdForUser } from "./utils.js";

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
});
