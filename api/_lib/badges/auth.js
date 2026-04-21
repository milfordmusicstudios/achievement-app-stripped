function getQueryParam(req, key) {
  if (req.query && typeof req.query === "object" && req.query[key] != null) {
    return req.query[key];
  }
  try {
    const url = new URL(req.url || "", "http://localhost");
    return url.searchParams.get(key);
  } catch {
    return null;
  }
}

function getAuthResult(req) {
  const vercelCron = req.headers?.["x-vercel-cron"];
  if (vercelCron) {
    return { ok: true, status: 200, method: "vercel-cron-header" };
  }

  const secret = process.env.BADGE_CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const headerSecret = String(req.headers?.["x-cron-secret"] || "").trim();
  const querySecret = String(getQueryParam(req, "cron_secret") || "").trim();
  const authHeader = String(req.headers?.authorization || "");
  const bearerSecret = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const provided = headerSecret || querySecret || bearerSecret;
  if (!provided || provided !== secret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

module.exports = {
  getAuthResult,
  getQueryParam
};
