// config.js

// LIVE DEPLOYED SERVERS (backend)
const BASE_API = "https://achievement-backend-a693.onrender.com";
const BASE_UPLOAD = "https://achievement-backend-a693.onrender.com";

// ---- APP ENV SWITCHING ----
// demo mode removed. Environment is determined by hostname.
(function setAppEnv() {
  const host = window.location.hostname;

  // Local dev
  if (host === "localhost" || host === "127.0.0.1") {
    window.APP_ENV = "dev";
    return;
  }

  // If you later create a dedicated dev domain like dev.yoursite.com:
  if (host.startsWith("dev.") || host.includes("dev")) {
    window.APP_ENV = "dev";
    return;
  }
// Any Vercel deployment (preview/dev) should use DEV
if (host.endsWith("vercel.app")) {
  window.APP_ENV = "dev";
  return;
}

  // Default to prod
  window.APP_ENV = "prod";
})();
