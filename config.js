// config.js
// This module detects the intended environment, exposes Supabase credentials, and makes the information
// available via globals so every page can use the same source of truth.

const ENVIRONMENTS = {
  prod: {
    label: "prod",
    description: "Production (HTTPS on Vercel / deployed hosts)",
    supabaseUrl: "https://wygdmapqwqjqrmrksaef.supabase.co",
    supabaseAnonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Z2RtYXBxd3FqcXJtcmtzYWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyODE2NDEsImV4cCI6MjA2ODg1NzY0MX0.LPkBdlfSc6V8dbQ6wTAJMPvm7PzQ1OxOraypdee7w2I",
    backendBase: "https://achievement-backend-a693.onrender.com",
  },
  dev: {
    label: "dev",
    description: "Local/dev (defaults to the prod credentials until a dedicated dev project is configured)",
    supabaseUrl: "https://wygdmapqwqjqrmrksaef.supabase.co",
    supabaseAnonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Z2RtYXBxd3FqcXJtcmtzYWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyODE2NDEsImV4cCI6MjA2ODg1NzY0MX0.LPkBdlfSc6V8dbQ6wTAJMPvm7PzQ1OxOraypdee7w2I",
    backendBase: "https://achievement-backend-a693.onrender.com",
  },
};

const VALID_ENV_NAMES = Object.keys(ENVIRONMENTS);
const DEFAULT_ENV = "prod";
const ENV_QUERY_PARAM = "env";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const LOCAL_PROTOCOLS = new Set(["file:"]);

function getManualEnvOverride() {
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get(ENV_QUERY_PARAM);
    if (!requested) return null;
    const normalized = requested.trim().toLowerCase();
    if (VALID_ENV_NAMES.includes(normalized)) return normalized;
  } catch (error) {
    console.warn("[Config] Failed to read env override:", error);
  }
  return null;
}

function inferEnvFromHost() {
  if (LOCAL_PROTOCOLS.has(window.location.protocol)) {
    return "dev";
  }

  const hostname = (window.location.hostname || "").toLowerCase();
  if (LOCAL_HOSTNAMES.has(hostname)) {
    return "dev";
  }

  return DEFAULT_ENV;
}

function determineAppEnv() {
  const manual = getManualEnvOverride();
  if (manual) {
    return { env: manual, source: `query:${manual}` };
  }

  const inferred = inferEnvFromHost();
  const reason = inferred === "dev" ? "host/local" : "default:prod";
  return { env: inferred, source: reason };
}

const { env: APP_ENV, source: APP_ENV_SOURCE } = determineAppEnv();
const SELECTED_ENV = ENVIRONMENTS[APP_ENV] || ENVIRONMENTS[DEFAULT_ENV];

function exposeGlobals() {
  window.APP_ENV = APP_ENV;
  window.APP_ENV_SOURCE = APP_ENV_SOURCE;
  window.SUPABASE_URL = SELECTED_ENV.supabaseUrl;
  window.SUPABASE_ANON_KEY = SELECTED_ENV.supabaseAnonKey;
  window.SUPABASE_CONFIG = { ...SELECTED_ENV, name: APP_ENV };
}

exposeGlobals();
console.info(`[Config] APP_ENV=${APP_ENV} source=${APP_ENV_SOURCE} host=${window.location.host}`);

export { APP_ENV, APP_ENV_SOURCE, DEFAULT_ENV };
export function getAppEnv() {
  return APP_ENV;
}
export function getSupabaseConfig() {
  return SELECTED_ENV;
}
export function getEnvironmentNames() {
  return [...VALID_ENV_NAMES];
}
