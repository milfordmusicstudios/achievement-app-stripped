// config.js
//Local Hoast
//const BASE_API = "http://localhost:3000";
//const BASE_UPLOAD = "http://localhost:3001";

//Proving Grounds
//const BASE_API = "http://10.1.10.235:3000";
//const BASE_UPLOAD = "http://10.1.10.235:3001";


//Home Host
//const BASE_API = "http://10.0.0.220:3000";
//const BASE_UPLOAD = "http://10.0.0.220:3001";

// config.js

// LIVE DEPLOYED SERVERS
const BASE_API = "https://achievement-backend-a693.onrender.com";
const BASE_UPLOAD = "https://achievement-backend-a693.onrender.com";

// ---- APP ENV SWITCHING ----
// Set to true ONLY when you want demo behavior to override normal env detection.
window.DEMO_MODE = false;

// Auto-detect environment by hostname unless DEMO_MODE is true.
(function setAppEnv() {
  const host = window.location.hostname;

  if (window.DEMO_MODE === true) {
    window.APP_ENV = "demo";
    return;
  }

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

  // Default to prod
  window.APP_ENV = "prod";
})();
