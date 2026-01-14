// supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// APP_ENV must be set in config.js before this file loads.
// Allowed: "dev" | "prod" | "demo"
const env = (
  window.APP_ENV ||
  (location.hostname.includes("vercel.app") ? "dev" : "prod")
).toLowerCase();

const SUPABASE_CONFIG = {
  dev: {
    url: "https://dtvcjmcstedudunjvbuv.supabase.co",
    anonKey: "sb_publishable_x8CRqSl5wiZhIIGy1ozb5g_8l_cVpft",
  },
  // Keep your current live project here for now (this is your existing one)
  prod: {
    url: "https://wygdmapqwqjqrmrksaef.supabase.co",
anonKey: "sb_publishable_x8CRqSl5wiZhIIGy1ozb5g_8l_cVpft",
  },
  // Not used until you create a demo Supabase project
  demo: {
    url: "",
    anonKey: "",
  },
};

const selected = SUPABASE_CONFIG[env] || SUPABASE_CONFIG.dev;

if (!selected.url || !selected.anonKey) {
  console.warn(
    `[Supabase] Missing keys for env="${env}". Falling back to DEV config.`
  );
}

const finalConfig = selected.url && selected.anonKey ? selected : SUPABASE_CONFIG.dev;

export const supabase = createClient(finalConfig.url, finalConfig.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
window.supabase = supabase;

console.log(`[Supabase] client initialized (env=${env})`, supabase);

function renderEnvBadge() {
  const el = document.getElementById("envBadge");
  if (!el) return;

  // You likely already have something like ENV or APP_ENV
const env = (
  window.APP_ENV ||
  (location.hostname.includes("vercel.app") ? "dev" : "prod")
).toLowerCase();

  el.textContent = `ENV: ${env.toUpperCase()}`;

  el.classList.remove("dev", "demo", "prod");
  el.classList.add(env);

  // show for dev/demo only
  if (env === "dev" || env === "demo") {
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", renderEnvBadge);
