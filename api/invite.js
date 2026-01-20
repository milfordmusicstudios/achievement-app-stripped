// README:
// - Never expose SUPABASE_SERVICE_ROLE_KEY client-side.
// - This endpoint sends the invite email (single email flow) via Supabase Admin API.

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(req) {
  if (!req.body) return null;
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_BASE_URL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !APP_BASE_URL) {
    return res.status(500).json({ ok: false, error: "Missing server configuration" });
  }

  const body = parseBody(req);
  const email = body?.email ? String(body.email).trim().toLowerCase() : "";
  const studioId = body?.studio_id ? String(body.studio_id).trim() : "";
  const roleHint = body?.role_hint ? String(body.role_hint).trim() : "student";

  if (!email) {
    return res.status(400).json({ ok: false, error: "Missing email" });
  }
  if (!studioId) {
    return res.status(400).json({ ok: false, error: "Missing studio_id" });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const inviteRow = {
    token,
    studio_id: studioId,
    type: "studio_member",
    role_hint: roleHint || "student",
    invited_email: email,
    status: "pending",
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  };

  // TODO: If your "invites" schema differs, adjust fields or constraints here.
  const { error: inviteErr } = await supabaseAdmin
    .from("invites")
    .upsert(inviteRow, { onConflict: "token" });

  if (inviteErr) {
    return res.status(500).json({ ok: false, error: inviteErr.message || "Invite insert failed" });
  }

  const redirectTo = `${APP_BASE_URL.replace(/\/+$/, "")}/auth-callback.html?token=${token}`;
  const { error: emailErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo
  });

  if (emailErr) {
    return res.status(500).json({ ok: false, error: emailErr.message || "Invite email failed" });
  }

  return res.status(200).json({ ok: true });
};
