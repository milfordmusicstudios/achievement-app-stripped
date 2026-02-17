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
