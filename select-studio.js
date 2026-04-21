import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", async () => {
  const list = document.getElementById("studioList");
  if (!list) return;

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;
  if (!authUser?.id) {
    window.location.href = "login.html";
    return;
  }

  const { data: memberships, error } = await supabase
    .from("studio_members")
    .select("studio_id, roles")
    .eq("user_id", authUser.id);

  if (error) {
    console.error("[StudioRoute] studio picker load failed", error);
    list.textContent = "Unable to load studios.";
    return;
  }

  if (!memberships || memberships.length === 0) {
    console.log("[StudioRoute] redirect target", "settings.html", "(placeholder)");
    window.location.href = "settings.html";
    return;
  }

  list.innerHTML = "";
  memberships.forEach(m => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "blue-button";
    btn.textContent = `Studio ${m.studio_id}`;
    btn.addEventListener("click", () => {
      localStorage.setItem("activeStudioId", m.studio_id);
      localStorage.setItem("activeStudioRoles", JSON.stringify(m.roles || []));
      console.log("[StudioRoute] chosen studio_id", m.studio_id);
      console.log("[StudioRoute] redirect target", "index.html");
      window.location.href = "index.html";
    });
    list.appendChild(btn);
  });
});
