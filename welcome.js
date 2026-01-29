import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", async () => {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user || null;

  if (!authUser?.id) {
    console.log("[Welcome] redirect target", "login.html");
    window.location.href = "login.html";
    return;
  }

  console.log("[Welcome] auth user id", authUser.id);

  const { data: memberships, error } = await supabase
    .from("studio_members")
    .select("studio_id, roles")
    .eq("user_id", authUser.id);

  if (error) {
    console.error("[Welcome] membership query failed", error);
    return;
  }

  const count = memberships?.length || 0;
  console.log("[Welcome] membership count", count);

  if (count > 0) {
    console.log("[Welcome] redirect target", "index.html");
    window.location.href = "index.html";
    return;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await window.getSupabaseClient()?.auth.signOut();
      window.location.href = "login.html";
    });
  }
});
