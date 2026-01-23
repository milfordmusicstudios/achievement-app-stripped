// supabaseClient.js (UMD/global build - no ESM import)

// Determine env
const env = (
  window.APP_ENV ||
  (location.hostname.includes("vercel.app") ? "dev" : "prod")
).toLowerCase();

// Your per-env config
const SUPABASE_CONFIG = {
  dev: {
    url: "https://dtvcjmcstedudunjvbuv.supabase.co",
    anonKey: "sb_publishable_x8CRqSl5wiZhIIGy1ozb5g_8l_cVpft",
  },
  prod: {
    url: "https://wygdmapqwqjqrmrksaef.supabase.co",
    anonKey: "sb_publishable_x8CRqSl5wiZhIIGy1ozb5g_8l_cVpft",
  },
  demo: { url: "", anonKey: "" },
};

const selected = SUPABASE_CONFIG[env] || SUPABASE_CONFIG.dev;
const finalConfig =
  selected.url && selected.anonKey ? selected : SUPABASE_CONFIG.dev;

if (!window.supabase || !window.supabase.createClient) {
  console.error(
    "[Supabase] window.supabase.createClient not found. " +
      "Make sure the Supabase CDN script loads BEFORE supabaseClient.js"
  );
}

export const supabase = window.supabase.createClient(
  finalConfig.url,
  finalConfig.anonKey,
  {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { headers: { apikey: finalConfig.anonKey } },
  }
);

// Do NOT overwrite window.supabase (that's the library namespace)
window.sb = supabase;

console.log(`[Supabase] client initialized (env=${env})`, supabase);

function renderEnvBadge() {
  const el = document.getElementById("envBadge");
  if (!el) return;

  const e = (
    window.APP_ENV ||
    (location.hostname.includes("vercel.app") ? "dev" : "prod")
  ).toLowerCase();

  el.textContent = `ENV: ${e.toUpperCase()}`;
  el.classList.remove("dev", "demo", "prod");
  el.classList.add(e);
  el.style.display = e === "dev" || e === "demo" ? "block" : "none";
}

document.addEventListener("DOMContentLoaded", renderEnvBadge);
