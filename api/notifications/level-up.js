const { createClient } = require("@supabase/supabase-js");
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
  let step = "init";
  let actorUserId = null;
  let studentUserId = null;
  let studioId = null;
  let recipientCount = 0;
  const fail = (status, stepName, details) => {
    const responseBody = {
      ok: false,
      error: "Failed to create level-up notifications",
      step: stepName,
      details: details || "unknown_error",
      extra: {
        actorUserId,
        studentUserId,
        studioId,
        recipientCount
      }
    };
    console.error("[LevelUpDiag][api/notifications/level-up.js] failure-response", {
      status,
      body: responseBody
    });
    return res.status(status).json(responseBody);
  };
  const logEarlyReturn = (status, reason, extra = {}) => {
    console.log("[LevelUpDiag][api/notifications/level-up.js] early-return", {
      method: req.method,
      status,
      reason,
      ...extra
    });
  };
  console.log("[LevelUpDiag][api/notifications/level-up.js] handler-entry", {
    method: req.method,
    query: req.query || {},
    hasBody: req.body != null
  });
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    logEarlyReturn(200, "OPTIONS preflight");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    logEarlyReturn(405, "method_not_allowed");
    return fail(405, "request.method_check", "Method not allowed");
  }

  const body = parseBody(req);
  console.log("[LevelUpDiag][api/notifications/level-up.js] parsed-body", body);
  studentUserId = String(body.studentUserId || body.userId || "").trim() || null;
  const requestedStudioId = String(body.studioId || "").trim();
  const level = Number(body.level || 0);
  if (!studentUserId || !Number.isFinite(level) || level <= 0) {
    logEarlyReturn(400, "missing_or_invalid_studentUserId_or_level", {
      studentUserId,
      level
    });
    return fail(400, "request.body_validation", "Missing studentUserId or level");
  }

  const url = process.env.SUPABASE_URL;
  const authKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !authKey) {
    logEarlyReturn(500, "missing_supabase_configuration", {
      hasUrl: Boolean(url),
      hasAuthKey: Boolean(authKey)
    });
    return fail(500, "supabase.config_validation", "Missing Supabase configuration");
  }

  const token = getAccessToken(req);
  if (!token) {
    logEarlyReturn(401, "missing_access_token");
    return fail(401, "auth.token_lookup", "Unauthorized: missing access token");
  }

  try {
    const throwStep = (stepName, err, context = {}) => {
      const wrapped = new Error(err?.message || String(err || "unknown_error"));
      wrapped.step = stepName;
      wrapped.context = context;
      wrapped.original = err || null;
      throw wrapped;
    };

    step = "auth.get_user";
    const authClient = createClient(url, authKey, { auth: { persistSession: false } });
    const {
      data: { user },
      error: userErr
    } = await authClient.auth.getUser(token);
    if (userErr || !user?.id) {
      logEarlyReturn(401, "invalid_access_token_user_lookup_failed", {
        userErr: userErr?.message || userErr || null
      });
      return fail(401, "auth.get_user", userErr?.message || "Unauthorized");
    }
    actorUserId = String(user.id);

    console.log("[LevelUpDiag][api/notifications/level-up.js] actor-authenticated", {
      actorUserId
    });

    step = "service_client";
    let admin;
    try {
      admin = buildSupabaseServiceClient();
    } catch (svcErr) {
      throwStep("service_client", svcErr);
    }

    step = "student.lookup";
    const { data: studentRow, error: studentErr } = await admin
      .from("users")
      .select('id, studio_id, "firstName", "lastName", "teacherIds"')
      .eq("id", String(studentUserId))
      .maybeSingle();
    if (studentErr) {
      throwStep("student.lookup", studentErr, { studentUserId });
    }
    if (!studentRow?.id) {
      logEarlyReturn(404, "student_not_found", { studentUserId });
      return fail(404, "student.lookup", "Student not found");
    }

    studioId = String(requestedStudioId || studentRow?.studio_id || "").trim() || null;
    if (!studioId) {
      step = "student_membership.lookup";
      const { data: studentMembership } = await admin
        .from("studio_members")
        .select("studio_id")
        .eq("user_id", String(studentUserId))
        .limit(1);
      studioId = String(studentMembership?.[0]?.studio_id || "").trim() || null;
    }
    if (!studioId) {
      logEarlyReturn(400, "unable_to_resolve_studio", { studentUserId, requestedStudioId });
      return fail(400, "studio.resolve", "Unable to resolve studio");
    }
    console.log("[LevelUpDiag][api/notifications/level-up.js] resolved-identifiers", {
      actorUserId,
      studentUserId,
      studioId
    });

    step = "caller_membership.lookup";
    const { data: callerMembership, error: callerMemberErr } = await admin
      .from("studio_members")
      .select("roles")
      .eq("studio_id", studioId)
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (callerMemberErr) {
      throwStep("caller_membership.lookup", callerMemberErr, { actorUserId, studioId });
    }
    const callerRoles = parseRoles(callerMembership?.roles);
    const callerIsStaff = callerRoles.includes("admin") || callerRoles.includes("teacher");
    const callerIsStudent = actorUserId === String(studentUserId);
    if (!callerIsStaff && !callerIsStudent) {
      logEarlyReturn(403, "forbidden_caller_not_staff_or_student", {
        callerUserId: actorUserId,
        studentUserId,
        studioId,
        callerRoles
      });
      return fail(403, "caller_membership.authorization", "Forbidden");
    }

    const assignedTeacherIds = new Set(
      (Array.isArray(studentRow?.teacherIds) ? studentRow.teacherIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );

    step = "staff_memberships.lookup";
    const { data: staffRows, error: staffErr } = await admin
      .from("studio_members")
      .select("user_id, roles")
      .eq("studio_id", studioId)
      .or("roles.cs.{admin},roles.cs.{teacher}");
    if (staffErr) {
      throwStep("staff_memberships.lookup", staffErr, { studioId });
    }

    const recipientIds = new Set([studentUserId]);
    (Array.isArray(staffRows) ? staffRows : []).forEach((row) => {
      const uid = String(row?.user_id || "").trim();
      if (!uid) return;
      const roles = parseRoles(row?.roles);
      if (roles.includes("admin")) {
        recipientIds.add(uid);
        return;
      }
      if (roles.includes("teacher") && assignedTeacherIds.has(uid)) {
        recipientIds.add(uid);
      }
    });
    const resolvedRecipientIds = Array.from(recipientIds).filter(Boolean);
    recipientCount = resolvedRecipientIds.length;
    console.log("[LevelUpDiag][api/notifications/level-up.js] resolved-recipients", {
      studentUserId,
      resolvedStudioId: studioId,
      resolvedTargetUserIds: resolvedRecipientIds
    });

    step = "notifications.payload_build";
    const studentName = String(body.studentName || `${studentRow?.firstName || ""} ${studentRow?.lastName || ""}`.trim() || "Student");
    const message = `${studentName} reached Level ${level}.`;
    const relatedLogId = String(body.related_log_id || body.relatedLogId || "").trim() || null;
    const payload = resolvedRecipientIds
      .filter(Boolean)
      .map((uid) => ({
        userId: uid,
        message,
        type: "level_up",
        read: false,
        created_by: actorUserId,
        ...(relatedLogId ? { related_log_id: relatedLogId } : {}),
        studio_id: studioId
      }))
      .map((row) => {
        const cleaned = { ...row };
        delete cleaned.id;
        if (cleaned.id == null) delete cleaned.id;
        if (cleaned.related_log_id == null) delete cleaned.related_log_id;
        return cleaned;
      });

    step = "notifications.dedupe_lookup";
    const { data: existingRows, error: existingErr } = await admin
      .from("notifications")
      .select('user_id, "userId", message')
      .eq("studio_id", studioId)
      .eq("type", "level_up")
      .eq("message", message);
    if (existingErr) {
      throwStep("notifications.dedupe_lookup", existingErr, { studioId, studentUserId, level });
    }

    const existingKeys = new Set((existingRows || []).map((row) => {
      const uid = String(row?.user_id || row?.userId || "").trim();
      return `${uid}:${String(row?.message || "")}`;
    }));
    const dedupedPayload = payload.filter((row) => {
      const uid = String(row?.userId || row?.user_id || "").trim();
      return !existingKeys.has(`${uid}:${message}`);
    });

    const payloadKeys = Array.from(
      dedupedPayload.reduce((set, row) => {
        Object.keys(row || {}).forEach((key) => set.add(key));
        return set;
      }, new Set())
    );
    console.log("[LevelUpDiag][api/notifications/level-up.js] final-payload-keys", {
      keys: payloadKeys
    });

    console.log("[LevelUpDiag][api/notifications/level-up.js] insert-payload", {
      source: "api/notifications/level-up.js::insertLevelUpNotifications",
      payload: dedupedPayload,
      skippedDuplicates: payload.length - dedupedPayload.length,
      resolved_userId: dedupedPayload.map((row) => row.userId),
      resolved_studio_id: studioId,
      resolved_created_by: actorUserId,
      resolved_related_log_id: dedupedPayload.map((row) => row.related_log_id ?? null)
    });
    if (!dedupedPayload.length) {
      console.log("[LevelUpDiag][api/notifications/level-up.js] success-noop-duplicate", {
        resolvedStudioId: studioId,
        resolvedTargetUserIds: resolvedRecipientIds,
        level
      });
      return res.status(200).json({ ok: true, recipientCount: 0, skippedDuplicates: payload.length });
    }

    step = "notifications.insert";
    const { data: insertData, error: insertErr } = await admin.from("notifications").insert(dedupedPayload);
    console.log("[LevelUpDiag][api/notifications/level-up.js] insert-result", {
      source: "api/notifications/level-up.js::insertLevelUpNotifications",
      data: insertData ?? null,
      error: insertErr ?? null,
      summary: insertErr ? "insert_error" : "insert_ok"
    });
    if (insertErr) {
      if (insertErr?.code === "23505") {
        console.warn("[LevelUpDiag][api/notifications/level-up.js] duplicate-protected-by-db", {
          source: "api/notifications/level-up.js::insertLevelUpNotifications",
          error: insertErr?.message || null,
          resolvedStudioId: studioId,
          resolvedTargetUserIds: resolvedRecipientIds,
          level
        });
        return res.status(200).json({ ok: true, recipientCount: 0, skippedDuplicates: dedupedPayload.length });
      }
      return fail(500, "notifications.insert", insertErr?.message || "unknown_insert_error");
    }

    console.log("[LevelUpDiag][api/notifications/level-up.js] success", {
      resolvedStudioId: studioId,
      resolvedTargetUserIds: resolvedRecipientIds,
      payloadCount: dedupedPayload.length,
      skippedDuplicates: payload.length - dedupedPayload.length
    });
    return res.status(200).json({ ok: true, recipientCount: dedupedPayload.length, skippedDuplicates: payload.length - dedupedPayload.length });
  } catch (error) {
    const details = error?.message || String(error || "unknown_error");
    const failedStep = error?.step || step || "unknown";
    console.error("[Notifications][LevelUp] failed", {
      step: failedStep,
      details,
      context: error?.context || null,
      original: error?.original || null
    });
    return fail(500, failedStep, details);
  }
};
