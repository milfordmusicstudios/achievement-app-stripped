import { supabase } from "./supabaseClient.js";
import { requireStudioRoles, getAuthUserId, getActiveStudioIdForUser } from "./utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  const authz = await requireStudioRoles(["admin"]);
  console.log("[AuthZ]", { page: "studio-settings", requiredRoles: ["admin"], roles: authz.roles, studioId: authz.studioId });
  if (!authz.ok) return;

  const authUserId = await getAuthUserId();
  const studioId = authz.studioId || await getActiveStudioIdForUser(authUserId);
  if (!studioId) {
    window.location.href = "index.html";
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

  const nameEl = document.getElementById("studioName");
  const slugEl = document.getElementById("studioSlug");
  if (nameEl) nameEl.textContent = studio?.name || "—";
  if (slugEl) slugEl.textContent = studio?.slug || "—";
});
