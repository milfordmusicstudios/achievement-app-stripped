import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Determine env: config.js can set window.APP_ENV = "dev" | "prod" | "demo"
const env = (
  window.APP_ENV ||
  (location.hostname.includes("vercel.app") ? "dev" : "prod")
).toLowerCase();

let _client = null;

function readConfig() {
  const cfg =
    window.SUPABASE_CONFIG ||
    window.APP_CONFIG?.supabase ||
    window.CONFIG?.supabase ||
    window.CONFIG ||
    {};

  const url = cfg.url || cfg.SUPABASE_URL || cfg.supabaseUrl || "";
  const anon = cfg.anonKey || cfg.SUPABASE_ANON_KEY || cfg.supabaseAnonKey || "";
  return { url, anon };
}

export function getSupabaseClient() {
  if (_client) return _client;

  const { url, anon } = readConfig();
  if (!url || !anon) {
    const configSource = window.SUPABASE_CONFIG_SOURCE || "none";
    console.debug(`[Supabase] config source: ${configSource}`);
    const isLocalHost =
      typeof location !== "undefined" &&
      (location.hostname.includes("localhost") || location.hostname.includes("127.0.0.1"));
    console.error(
      "[Supabase] Missing SUPABASE url/anonKey. Check config.js/env.",
      { urlPresent: !!url, anonPresent: !!anon }
    );
    if (isLocalHost) {
      console.info(
        'Hint: run window.setSupabaseConfig("https://<project-ref>.supabase.co", "<anon-key>") once to save local values.'
      );
    }
    return null;
  }

  _client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: {
        apikey: anon,
      },
    },
  });
  console.log(`[Supabase] client initialized (env=${env})`);
  return _client;
}

const handler = {
  get(_, prop) {
    const client = getSupabaseClient();
    if (!client) return undefined;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_, prop, value) {
    const client = getSupabaseClient();
    if (!client) return true;
    client[prop] = value;
    return true;
  },
  has(_, prop) {
    const client = getSupabaseClient();
    if (!client) return false;
    return prop in client;
  },
  ownKeys() {
    const client = getSupabaseClient();
    if (!client) return [];
    return Reflect.ownKeys(client);
  },
  getOwnPropertyDescriptor(_, prop) {
    const client = getSupabaseClient();
    if (!client) {
      return undefined;
    }
    return (
      Object.getOwnPropertyDescriptor(client, prop) || {
        configurable: true,
        enumerable: true,
        value: client[prop],
      }
    );
  },
};

export const supabase = new Proxy({}, handler);

// Optional: expose for debugging in console (do not overwrite window.supabase)
window.sb = supabase;
// Expose Supabase for non-module scripts (nav, utils, routing, logout)
window.supabase = supabase;
window.getSupabaseClient = getSupabaseClient;

function renderEnvBadge() {
  const el = document.getElementById("envBadge");
  if (!el) return;

  el.textContent = `ENV: ${env.toUpperCase()}`;
  el.classList.remove("dev", "demo", "prod");
  el.classList.add(env);
  el.style.display = env === "dev" || env === "demo" ? "block" : "none";
}

document.addEventListener("DOMContentLoaded", renderEnvBadge);
