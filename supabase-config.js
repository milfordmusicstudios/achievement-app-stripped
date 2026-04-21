(() => {
  const isLocalHost =
    typeof location !== "undefined" &&
    (location.hostname.includes("localhost") || location.hostname.includes("127.0.0.1"));

  const ensureLocalStorage = () => {
    if (!isLocalHost) return false;
    if (typeof window === "undefined" || !window.localStorage) return false;
    return true;
  };

  window.setSupabaseConfig = (url, anonKey) => {
    if (!ensureLocalStorage()) {
      console.error("[Supabase-config] setSupabaseConfig is only available on localhost.");
      return;
    }
    if (!url || !anonKey) {
      console.error("[Supabase-config] Both url and anonKey are required.");
      return;
    }
    window.localStorage.setItem("SUPABASE_URL", url);
    window.localStorage.setItem("SUPABASE_ANON_KEY", anonKey);
    window.location.reload();
  };

  const existing = window.SUPABASE_CONFIG;
  if (existing?.url && existing?.anonKey) {
    window.SUPABASE_CONFIG_SOURCE = window.SUPABASE_CONFIG_SOURCE || "window";
    return;
  }

  const config = window.CONFIG || {};
  const supabaseConfig = window.CONFIG?.supabase || {};
  let url = supabaseConfig.url || supabaseConfig.SUPABASE_URL || config.SUPABASE_URL || "";
  let anonKey =
    supabaseConfig.anonKey || supabaseConfig.SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY || "";

  let finalSource = "none";
  if (url && anonKey) {
    finalSource = "window";
  }

  const readMeta = name => {
    if (typeof document === "undefined") {
      return "";
    }
    return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() || "";
  };
  if ((!url || !anonKey) && typeof document !== "undefined") {
    const metaUrl = readMeta("supabase-url");
    const metaAnon = readMeta("supabase-anon-key");
    if (!url && metaUrl) {
      url = metaUrl;
    }
    if (!anonKey && metaAnon) {
      anonKey = metaAnon;
    }
    if (url && anonKey && finalSource === "none") {
      finalSource = "meta";
    }
  }

  if ((!url || !anonKey) && ensureLocalStorage()) {
    if (!url) {
      const storedUrl = window.localStorage.getItem("SUPABASE_URL");
      if (storedUrl) {
        url = storedUrl;
      }
    }
    if (!anonKey) {
      const storedAnon = window.localStorage.getItem("SUPABASE_ANON_KEY");
      if (storedAnon) {
        anonKey = storedAnon;
      }
    }
    if (url && anonKey && finalSource === "none") {
      finalSource = "localStorage";
    }
  }

  const containsPlaceholder = (value, patterns) => {
    if (!value) return false;
    const normalized = value.toLowerCase();
    return patterns.some(pattern => normalized.includes(pattern));
  };

  const urlPlaceholders = ["yourproject.supabase.co", "yourproject"];
  const anonPlaceholders = ["your_anon_key"];
  const hasPlaceholderUrl = containsPlaceholder(url, urlPlaceholders);
  const hasPlaceholderAnon = containsPlaceholder(anonKey, anonPlaceholders);

  if (hasPlaceholderUrl || hasPlaceholderAnon) {
    window.SUPABASE_CONFIG_SOURCE = "placeholder";
    console.error("Supabase config is still placeholder. Set real SUPABASE_URL and SUPABASE_ANON_KEY.");
    return;
  }

  if (url && anonKey) {
    window.SUPABASE_CONFIG = { url, anonKey };
    window.SUPABASE_CONFIG_SOURCE = finalSource;
    return;
  }

  window.SUPABASE_CONFIG_SOURCE = finalSource;
  console.error(
    "[Supabase-config] Missing Supabase url/anonKey. Define window.SUPABASE_CONFIG with both values, add <meta name=\"supabase-url\"> and <meta name=\"supabase-anon-key\"> tags, or (on localhost/127.0.0.1) set localStorage SUPABASE_URL and SUPABASE_ANON_KEY."
  );
})();
