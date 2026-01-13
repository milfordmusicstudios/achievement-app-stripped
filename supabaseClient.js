// supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// APP_ENV must be set in config.js before this file loads.
// Allowed: "dev" | "prod" | "demo"
const env = (window.APP_ENV || "dev").toLowerCase();

const SUPABASE_CONFIG = {
  dev: {
    url: "https://dtvcjmcstedudunjvbuv.supabase.co",
    anonKey: "sb_publishable_x8CRqSl5wiZhIIGy1ozb5g_8l_cVpft",
  },
  // Keep your current live project here for now (this is your existing one)
  prod: {
    url: "https://wygdmapqwqjqrmrksaef.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Z2RtYXBxd3FqcXJtcmtzYWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyODE2NDEsImV4cCI6MjA2ODg1NzY0MX0.LPkBdlfSc6V8dbQ6wTAJMPvm7PzQ1OxOraypdee7w2I",
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

console.log(`[Supabase] client initialized (env=${env})`, supabase);
