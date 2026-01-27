// supabaseClient.js (ESM module)
// Loads Supabase via the global client that the CDN script injects.
// Requires: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> + <script type="module" src="supabaseClient.js"></script>

// Determine env: config.js can set window.APP_ENV = "dev" | "prod" | "demo"
const env = (
  window.APP_ENV ||
  (location.hostname.includes("vercel.app") ? "dev" : "prod")
).toLowerCase();

const SUPABASE_CONFIG = {
  dev: {
    url: "https://dtvcjmcstedudunjvbuv.supabase.co",
    anonKey: "sb_publishable_x8CRqSl5wiZhIIGy1ozb5g_8l_cVpft",
  },
  prod: {
    url: "https://wygdmapqwqjqrmrksaef.supabase.co",
    anonKey: "sb_publishable_x8CRqSl5wiZhIIGy1ozb5g_8l_cVpft",
  },
  demo: {
    url: "",
    anonKey: "",
  },
};

const selected = SUPABASE_CONFIG[env] || SUPABASE_CONFIG.dev;
const finalConfig =
  selected.url && selected.anonKey ? selected : SUPABASE_CONFIG.dev;

if (!finalConfig.url || !finalConfig.anonKey) {
  console.warn(`[Supabase] Missing config for env="${env}". Using DEV.`);
}

const createClientFactory =
  window.supabase?.createClient || window.Supabase?.createClient || null;

if (!createClientFactory) {
  console.warn("[Home] optional supabase factory missing; continuing without it");
}

const supabase = createClientFactory
  ? createClientFactory(finalConfig.url, finalConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: {
          apikey: finalConfig.anonKey,
        },
      },
    })
  : null;

export { supabase };

// Optional: expose for debugging in console (do not overwrite window.supabase)
window.sb = supabase;

function renderEnvBadge() {
  const el = document.getElementById("envBadge");
  if (!el) return;

  el.textContent = `ENV: ${env.toUpperCase()}`;
  el.classList.remove("dev", "demo", "prod");
  el.classList.add(env);
  el.style.display = env === "dev" || env === "demo" ? "block" : "none";
}

document.addEventListener("DOMContentLoaded", renderEnvBadge);

console.log(`[Supabase] client initialized (env=${env})`);
