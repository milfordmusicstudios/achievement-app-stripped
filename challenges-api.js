import { supabase } from "./supabaseClient.js";

export async function createChallenge(payload) {
  const { data, error } = await supabase.rpc("create_teacher_challenge", {
    p_studio_id: payload?.studioId ?? null,
    p_title: payload?.title ?? null,
    p_description: payload?.description ?? null,
    p_points: payload?.points ?? null,
    p_assignment_type: payload?.assignmentType ?? null,
    p_assignment_teacher_id: payload?.assignmentTeacherId ?? null,
    p_selected_student_ids: payload?.selectedStudentIds ?? null,
    p_start_date: payload?.startDate ?? null,
    p_end_date: payload?.endDate ?? null
  });

  if (error) throw error;
  return data;
}

export async function updateAssignmentStatus(assignmentId, status) {
  const { error } = await supabase.rpc("update_challenge_assignment_status", {
    p_assignment_id: assignmentId,
    p_new_status: status
  });

  if (error) throw error;
}

export async function completeChallengeAndCreateLog(assignmentId, studentId, logDate) {
  const { data, error } = await supabase.rpc("complete_challenge_and_create_log", {
    p_assignment_id: assignmentId,
    p_student_id: studentId,
    p_log_date: logDate ?? null
  });

  if (error) throw error;
  return data;
}

export async function fetchMyChallengeAssignments(studioId, studentId) {
  const targetStudentId = String(studentId || "").trim();
  if (!targetStudentId) return [];

  const { data, error } = await supabase
    .from("teacher_challenge_assignments")
    .select(`
      id,
      status,
      accepted_at,
      completed_at,
      dismissed_at,
      student_id,
      created_at,
      teacher_challenges:challenge_id (
        id,
        title,
        description,
        points,
        start_date,
        end_date,
        created_by
      )
    `)
    .eq("studio_id", studioId)
    .eq("student_id", targetStudentId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listStaffChallenges(studioId) {
  const { data, error } = await supabase.rpc("list_teacher_challenges_for_staff", {
    p_studio_id: studioId
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function updateChallenge(payload) {
  const { error } = await supabase.rpc("update_teacher_challenge", {
    p_challenge_id: payload?.challengeId ?? null,
    p_title: payload?.title ?? null,
    p_description: payload?.description ?? null,
    p_points: payload?.points ?? null,
    p_start_date: payload?.startDate ?? null,
    p_end_date: payload?.endDate ?? null
  });
  if (error) throw error;
}

export async function deleteChallenge(challengeId) {
  const { error } = await supabase.rpc("delete_teacher_challenge", {
    p_challenge_id: challengeId
  });
  if (error) throw error;
}
