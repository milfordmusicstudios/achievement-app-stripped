const { createClient } = require("@supabase/supabase-js");
const { evaluateAndAwardBadges } = require("../_lib/badges/evaluate");
const { buildSupabaseServiceClient } = require("../_lib/badges/supabase-admin");

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function parseRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((r) => String(r || "").toLowerCase());
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((r) => String(r || "").toLowerCase());
    } catch {
      return raw.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
    }
  }
  return [String(raw || "").toLowerCase()];
}

function looksLikeJwt(value) {
  const token = String(value || "").trim();
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every(Boolean);
}

function parseCookies(req) {
  const raw = String(req.headers?.cookie || "");
  if (!raw) return {};
  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function getAccessToken(req) {
  const authHeader = String(req.headers?.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (looksLikeJwt(bearer)) return bearer;
  }

  const cookies = parseCookies(req);
  for (const [key, value] of Object.entries(cookies)) {
    if (looksLikeJwt(value)) return value;
    if (key.includes("auth-token")) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && looksLikeJwt(parsed[0])) return parsed[0];
        if (looksLikeJwt(parsed?.access_token)) return parsed.access_token;
        if (looksLikeJwt(parsed?.currentSession?.access_token)) return parsed.currentSession.access_token;
      } catch {
        // Ignore invalid JSON cookie values.
      }
    }
  }
  return "";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = parseBody(req);
  const studioId = String(body.studioId || body.studio_id || "").trim();
  const userId = String(body.userId || body.user_id || "").trim();
  if (!studioId || !userId) {
    return res.status(400).json({ ok: false, error: "Missing studioId or userId" });
  }

  const url = process.env.SUPABASE_URL;
  const authKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !authKey) {
    return res.status(500).json({ ok: false, error: "Missing Supabase configuration" });
  }

  const token = getAccessToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const authClient = createClient(url, authKey, { auth: { persistSession: false } });
    const {
      data: { user },
      error: userErr
    } = await authClient.auth.getUser(token);
    if (userErr || !user?.id) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const admin = buildSupabaseServiceClient();
    const { data: membership, error: membershipErr } = await admin
      .from("studio_members")
      .select("roles")
      .eq("studio_id", studioId)
      .eq("user_id", String(user.id))
      .maybeSingle();
    if (membershipErr) throw membershipErr;

    const roles = parseRoles(membership?.roles);
    const isStaff = roles.includes("admin") || roles.includes("teacher");
    if (!isStaff) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const result = await evaluateAndAwardBadges({ studioId, userId, client: admin });
    return res.status(200).json({
      ok: true,
      summary: {
        evaluatedUsers: Number(result.evaluatedUsers || 0),
        awardedRows: Number(result.awardedRows || 0),
        seasonalStarsAdded: Number(result.seasonalStarsAdded || 0)
      }
    });
  } catch (error) {
    console.error("[Badges][Approve] evaluate failed", { error: error?.message || error, studioId, userId });
    return res.status(500).json({ ok: false, error: "Badge evaluation failed" });
  }
};
