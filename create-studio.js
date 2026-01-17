import { supabase } from "./supabaseClient.js";

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

document.addEventListener("DOMContentLoaded", async () => {
  const nameInput = document.getElementById("studioName");
  const slugInput = document.getElementById("studioSlug");
  const form = document.getElementById("createStudioForm");
  const errorEl = document.getElementById("createStudioError");
  const backBtn = document.getElementById("backBtn");

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  if (!authUser?.id) {
    window.location.href = "login.html";
    return;
  }

  const { data: memberships, error: memErr } = await supabase
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", authUser.id);

  if (memErr) {
    console.error("[CreateStudio] membership query failed", memErr);
    if (errorEl) {
      errorEl.textContent = "Unable to check studio memberships. Please try again.";
      errorEl.style.display = "block";
    }
    return;
  }

  if ((memberships || []).length > 0) {
    window.location.href = "index.html";
    return;
  }

  if (nameInput && slugInput) {
    nameInput.addEventListener("input", () => {
      if (slugInput.dataset.manual === "true") return;
      slugInput.value = slugify(nameInput.value);
    });
    slugInput.addEventListener("input", () => {
      slugInput.dataset.manual = "true";
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = "welcome.html";
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!nameInput || !slugInput) return;

      const p_name = nameInput.value.trim();
      const p_slug = slugify(slugInput.value.trim());
      slugInput.value = p_slug;

      if (!p_name || !p_slug) return;

      errorEl.style.display = "none";
      errorEl.textContent = "";

      const { data, error } = await supabase
        .rpc("create_studio_and_make_admin", { p_name, p_slug });

      if (error) {
        console.error("[CreateStudio] create failed", error);
        errorEl.textContent = error.message || "Failed to create studio.";
        errorEl.style.display = "block";
        return;
      }

      const studioId = data?.id || data?.studio_id || data?.[0]?.id || data?.[0]?.studio_id;
      if (studioId) {
        localStorage.setItem("activeStudioId", studioId);
        localStorage.setItem("activeStudioRoles", JSON.stringify(["admin"]));
      }

      window.location.href = "index.html";
    });
  }
});
