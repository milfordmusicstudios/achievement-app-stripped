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

function looksLikeJwt(value) {
  const token = String(value || "").trim();
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every(Boolean);
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
    if (!key.includes("auth-token")) continue;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && looksLikeJwt(parsed[0])) return parsed[0];
      if (looksLikeJwt(parsed?.access_token)) return parsed.access_token;
      if (looksLikeJwt(parsed?.currentSession?.access_token)) return parsed.currentSession.access_token;
    } catch {
      // Ignore invalid cookie JSON.
    }
  }
  return "";
}

function maxTimestamp(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a) > new Date(b) ? a : b;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = parseBody(req);
  const studioId = String(body.studioId || body.studio_id || "").trim();
  if (!studioId) {
    return res.status(400).json({ ok: false, error: "Missing studioId" });
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

    const userId = String(user.id);
    const admin = buildSupabaseServiceClient();

    const { data: member, error: memberErr } = await admin
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const [{ data: stateRow, error: stateErr }, { data: preRows, error: preErr }] = await Promise.all([
      admin
        .from("user_celebration_state")
        .select("last_seen_badge_award_at,last_seen_level_award_at")
        .eq("studio_id", studioId)
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("user_badges")
        .select("earned_at")
        .eq("studio_id", studioId)
        .eq("user_id", userId)
        .order("earned_at", { ascending: false })
        .limit(1)
    ]);
    if (stateErr) throw stateErr;
    if (preErr) throw preErr;

    const preMaxEarnedAt = Array.isArray(preRows) && preRows[0]?.earned_at ? String(preRows[0].earned_at) : null;
    const badgeCursor = stateRow?.last_seen_badge_award_at
      ? String(stateRow.last_seen_badge_award_at)
      : preMaxEarnedAt;
    const levelCursor = stateRow?.last_seen_level_award_at
      ? String(stateRow.last_seen_level_award_at)
      : null;

    await evaluateAndAwardBadges({ studioId, userId, client: admin });

    let badgeQuery = admin
      .from("user_badges")
      .select("badge_slug,earned_at,badge_definitions(name)")
      .eq("studio_id", studioId)
      .eq("user_id", userId)
      .order("earned_at", { ascending: true });
    if (badgeCursor) {
      badgeQuery = badgeQuery.gt("earned_at", badgeCursor);
    }
    const { data: badgeRows, error: badgeErr } = await badgeQuery;
    if (badgeErr) throw badgeErr;

    const awardedBadges = (badgeRows || []).map((row) => ({
      slug: String(row.badge_slug || ""),
      name: String(row?.badge_definitions?.name || row.badge_slug || "Badge"),
      earned_at: row.earned_at
    }));

    const maxBadgeEarnedAt = (badgeRows || []).reduce(
      (acc, row) => maxTimestamp(acc, row?.earned_at ? String(row.earned_at) : null),
      badgeCursor || null
    );

    const leveledUp = null;
    const maxLevelAwardAt = levelCursor || null;

    const { error: upsertErr } = await admin
      .from("user_celebration_state")
      .upsert({
        studio_id: studioId,
        user_id: userId,
        last_seen_badge_award_at: maxBadgeEarnedAt,
        last_seen_level_award_at: maxLevelAwardAt,
        updated_at: new Date().toISOString()
      }, { onConflict: "studio_id,user_id" });
    if (upsertErr) throw upsertErr;

    return res.status(200).json({
      ok: true,
      awardedBadges,
      leveledUp,
      counts: {
        awardedBadges: awardedBadges.length,
        leveledUp: leveledUp ? 1 : 0
      }
    });
  } catch (error) {
    console.error("[Badges][StudentCelebrations] failed", {
      error: error?.message || error,
      studioId
    });
    return res.status(500).json({ ok: false, error: "Failed to load student celebrations" });
  }
};
