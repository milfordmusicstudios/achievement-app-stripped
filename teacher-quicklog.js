(() => {
  const card = document.getElementById("quickLogCard");
  const form = document.getElementById("quickLogForm");
  const studentSelect = document.getElementById("qlStudent");
  const categorySelect = document.getElementById("qlCategory");
  const dateInput = document.getElementById("qlDate");
  const pointsInput = document.getElementById("qlPoints");
  const notesInput = document.getElementById("qlNotes");
  const statusEl = document.getElementById("qlStatus");
  const submitBtn = document.getElementById("qlSubmit");

  let studioId = null;
  let currentUserId = null;
  const supabase = window.supabase;

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#c62828" : "#0b7a3a";
  }

  function parseRoles(profile) {
    const roleSet = new Set();
    if (profile && typeof profile.role === "string") {
      roleSet.add(profile.role.toLowerCase());
    }
    if (Array.isArray(profile?.roles)) {
      profile.roles.forEach(role => roleSet.add(String(role).toLowerCase()));
    } else if (typeof profile?.roles === "string") {
      profile.roles
        .split(",")
        .map(role => role.trim().toLowerCase())
        .filter(Boolean)
        .forEach(role => roleSet.add(role));
    }
    return Array.from(roleSet);
  }

  function isTeacherOrAdmin(profile) {
    const roles = parseRoles(profile);
    return roles.includes("teacher") || roles.includes("admin");
  }

  function isStudent(profile) {
    const roles = parseRoles(profile);
    return roles.includes("student");
  }

  function defaultDate() {
    if (!dateInput) return;
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  async function loadCategories() {
    if (!categorySelect) return;
    categorySelect.innerHTML = '<option value="">Select category</option>';

    let query = supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true });
    if (studioId) {
      query = query.eq("studio_id", studioId);
    }

    const { data, error } = await query;
    if (error) {
      setStatus("Could not load categories.", true);
      console.error("Quick log categories error:", error);
      return;
    }

    (data || []).forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.dataset.id = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  async function loadStudents() {
    if (!studentSelect) return;
    studentSelect.innerHTML = '<option value="">Select a student</option>';

    let query = supabase
      .from("users")
      .select("id, firstName, lastName, email, role, roles, studio_id");
    if (studioId) {
      query = query.eq("studio_id", studioId);
    }

    const { data, error } = await query;
    if (error) {
      setStatus("Could not load students.", true);
      console.error("Quick log students error:", error);
      return;
    }

    const students = (data || []).filter(isStudent);
    students.sort((a, b) => {
      const aName = `${a.lastName || ""} ${a.firstName || ""}`.trim().toLowerCase();
      const bName = `${b.lastName || ""} ${b.firstName || ""}`.trim().toLowerCase();
      return aName.localeCompare(bName);
    });

    students.forEach(student => {
      const opt = document.createElement("option");
      opt.value = student.id;
      const name = `${student.firstName || ""} ${student.lastName || ""}`.trim();
      opt.textContent = name || student.email || student.id;
      studentSelect.appendChild(opt);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("");

    const studentId = studentSelect?.value || "";
    const category = categorySelect?.value || "";
    const date = dateInput?.value || "";
    const points = Number(pointsInput?.value);
    const notes = (notesInput?.value || "").trim();

    if (!studentId || !category || !date) {
      setStatus("Please complete all required fields.", true);
      return;
    }
    if (!Number.isInteger(points) || points < 1) {
      setStatus("Points must be 1 or more.", true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      userId: studentId,
      date,
      category,
      points,
      notes: notes || null,
      status: "approved",
      created_by: currentUserId
    };
    if (studioId) {
      payload.studio_id = studioId;
    }

    const { error } = await supabase.from("logs").insert([payload]);
    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      console.error("Quick log insert error:", error);
      setStatus("Couldn't save log. Check console.", true);
      return;
    }

    setStatus("Logged. ✅");
    if (pointsInput) pointsInput.value = "";
    if (notesInput) notesInput.value = "";
  }

  async function init() {
    if (!card || !supabase?.auth) return;

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const session = sessionData?.session || null;
    if (sessionErr || !session) return;

    currentUserId = session.user.id;
    const activeStudioId = localStorage.getItem("activeStudioId") || null;

    let isStaff = false;
    if (activeStudioId) {
      const { data: studioMember } = await supabase
        .from("studio_members")
        .select("roles")
        .eq("user_id", currentUserId)
        .eq("studio_id", activeStudioId)
        .single();
      const roles = Array.isArray(studioMember?.roles) ? studioMember.roles : [];
      isStaff = roles.includes("admin") || roles.includes("teacher");
      studioId = activeStudioId;
    }

    if (!isStaff) {
      const { data: profile } = await supabase
        .from("users")
        .select("id, role, roles, studio_id, studioId")
        .eq("id", currentUserId)
        .single();
      if (!profile || !isTeacherOrAdmin(profile)) return;
      studioId = activeStudioId || profile.studio_id || profile.studioId || null;
    }

    card.style.display = "block";
    defaultDate();
    await loadCategories();
    await loadStudents();

    form?.addEventListener("submit", handleSubmit);
  }

  window.addEventListener("load", init);
})();
