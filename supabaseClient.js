// supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { APP_ENV, getSupabaseConfig } from "./config.js";

const STORAGE_KEY = "aa_last_env";
const AUTH_FLOW_TYPE_KEY = "aa_auth_flow_type";
const SUPABASE_KEY_PREFIX = "sb-";
const SUPABASE_KEY_INDICATOR = "supabase";

const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(`[Supabase] Missing credentials for env=${APP_ENV}`);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

function readTokensFromHash() {
  const rawHash = (window.location.hash || "").replace(/^#/, "");
  if (!rawHash) return null;
  const params = new URLSearchParams(rawHash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

async function ingestSessionFromHash() {
  const rawHash = (window.location.hash || "").replace(/^#/, "");
  const hashParams = new URLSearchParams(rawHash);
  const flowType = (hashParams.get("type") || "").toLowerCase();

  if (flowType) {
    try {
      sessionStorage.setItem(AUTH_FLOW_TYPE_KEY, flowType);
    } catch (error) {
      console.warn("[Supabase] Unable to persist auth flow hint:", error);
    }
  }

  const tokens = readTokensFromHash();
  if (!tokens) return false;

  // Remove hash immediately so tokens are not kept in the address bar.
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

  const { error } = await supabase.auth.setSession(tokens);
  if (error) {
    console.error("[Supabase] Token handoff setSession error:", error);
    return false;
  }
  return true;
}

function shouldDropKey(key) {
  if (!key) return false;
  const normalized = key.toLowerCase();
  return normalized.startsWith(SUPABASE_KEY_PREFIX) || normalized.includes(SUPABASE_KEY_INDICATOR);
}

async function sanitizeCachedAuth() {
  try {
    const storedKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (shouldDropKey(key)) {
        storedKeys.push(key);
      }
    }
    storedKeys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("[Supabase] Clearing localStorage failed:", error);
  }
}

async function enforceEnvConsistency() {
  let previousEnv;
  try {
    previousEnv = sessionStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[Supabase] Unable to read sessionStorage:", error);
  }

  if (previousEnv && previousEnv !== APP_ENV) {
    console.info(`[Supabase] env change (${previousEnv} -> ${APP_ENV}) detected, flushing auth cache.`);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      console.warn("[Supabase] signOut before env switch failed:", error);
    }
    await sanitizeCachedAuth();
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, APP_ENV);
  } catch (error) {
    console.warn("[Supabase] Unable to persist env hint:", error);
  }
}

await enforceEnvConsistency();
await ingestSessionFromHash();
console.info(`[Supabase] init env=${APP_ENV} host=${window.location.host}`);

export { supabase };
