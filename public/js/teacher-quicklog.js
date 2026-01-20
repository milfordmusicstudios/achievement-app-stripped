(() => {
  const statusEl = document.getElementById("qlStatus");
  const card = document.getElementById("quick-log-card");
  const categorySelect = document.getElementById("qlCategory");
  const studentSearch = document.getElementById("qlStudentSearch");
  const studentContainer = document.getElementById("qlStudents");
  const pointsInput = document.getElementById("qlPoints");
  const dateInput = document.getElementById("qlDateInput");
  const addDateBtn = document.getElementById("qlAddDateBtn");
  const datesContainer = document.getElementById("qlDates");
  const notesInput = document.getElementById("qlNote");
  const submitBtn = document.getElementById("qlSubmitBtn");
  const clearBtn = document.getElementById("qlClearBtn");

  const selectedDates = new Set();
  let studentsCache = [];
  let studioId = null;
  let authUser = null;
  let supabaseClient = null;

  function setStatus(message, type = "") {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = type === "error" ? "#c62828" : type === "success" ? "#0b7a3a" : "#1b2b3a";
  }

  function getMeta(name) {
    return document.querySelector(`meta[name="${name}"]`)?.content || "";
  }

  function parseRoles(value) {
    if (Array.isArray(value)) return value.map(r => String(r).toLowerCase());
    if (typeof value === "string") {
      return value.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
    }
    return [];
  }

  function renderStudents(list) {
    if (!studentContainer) return;
    studentContainer.innerHTML = "";
    if (!list.length) {
      studentContainer.textContent = "No students found.";
      return;
    }
    list.forEach(student => {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.marginBottom = "6px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = student.id;
      const name = `${student.lastName || student.last_name || ""}, ${student.firstName || student.first_name || ""}`
        .replace(/^,\s*/, "")
        .trim() || "Student";
      const span = document.createElement("span");
      span.textContent = name;
      row.appendChild(cb);
      row.appendChild(span);
      studentContainer.appendChild(row);
    });
  }

  function filterStudents() {
    const term = (studentSearch?.value || "").trim().toLowerCase();
    if (!term) return renderStudents(studentsCache);
    const filtered = studentsCache.filter(s => {
      const full = `${s.firstName || s.first_name || ""} ${s.lastName || s.last_name || ""}`.toLowerCase();
      return full.includes(term);
    });
    renderStudents(filtered);
  }

  function addDate(value) {
    if (!value || selectedDates.has(value)) return;
    selectedDates.add(value);
    const chip = document.createElement("span");
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "6px";
    chip.style.padding = "6px 10px";
    chip.style.border = "1px solid rgba(11,79,138,0.18)";
    chip.style.borderRadius = "999px";
    chip.style.background = "#e9f2fb";
    chip.dataset.value = value;
    chip.textContent = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.style.background = "transparent";
    remove.style.border = "none";
    remove.style.cursor = "pointer";
    remove.style.fontWeight = "700";
    remove.addEventListener("click", () => {
      selectedDates.delete(value);
      chip.remove();
    });
    chip.appendChild(remove);
    datesContainer?.appendChild(chip);
  }

  function clearForm() {
    selectedDates.clear();
    if (datesContainer) datesContainer.innerHTML = "";
    if (studentContainer) {
      studentContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
    }
    if (notesInput) notesInput.value = "";
    setStatus("");
  }

  async function loadCategories() {
    if (!categorySelect) return;
    categorySelect.innerHTML = '<option value="">Select category...</option>';
    const { data, error } = await supabaseClient
      .from("categories")
      .select("id, name, sort_order");
    if (error) {
      setStatus(error.message || "Failed to load categories.", "error");
      return;
    }
    const rows = (data || []).slice().sort((a, b) => {
      const aSort = Number.isFinite(a.sort_order) ? a.sort_order : 9999;
      const bSort = Number.isFinite(b.sort_order) ? b.sort_order : 9999;
      if (aSort !== bSort) return aSort - bSort;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    rows.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  async function loadStudents() {
    const base = supabaseClient
      .from("users")
      .select("id, firstName, lastName, first_name, last_name, roles, studio_id")
      .eq("studio_id", studioId);

    let { data, error } = await base.contains("roles", ["student"]).order("lastName", { ascending: true }).order("firstName", { ascending: true });
    if (error || !data?.length) {
      ({ data, error } = await base.ilike("roles", "%student%").order("lastName", { ascending: true }).order("firstName", { ascending: true }));
    }
    if (error) {
      setStatus(error.message || "Failed to load students.", "error");
      return;
    }
    studentsCache = data || [];
    studentsCache.sort((a, b) => {
      const aLast = (a.lastName || a.last_name || "").toLowerCase();
      const bLast = (b.lastName || b.last_name || "").toLowerCase();
      if (aLast !== bLast) return aLast.localeCompare(bLast);
      const aFirst = (a.firstName || a.first_name || "").toLowerCase();
      const bFirst = (b.firstName || b.first_name || "").toLowerCase();
      return aFirst.localeCompare(bFirst);
    });
    renderStudents(studentsCache);
  }

  async function insertLogs(rows, dateField, studentField) {
    const payload = rows.map(r => {
      const copy = { ...r };
      if (dateField !== "log_date") {
        copy[dateField] = copy.log_date;
        delete copy.log_date;
      }
      if (studentField !== "student_id") {
        copy[studentField] = copy.student_id;
        delete copy.student_id;
      }
      return copy;
    });
    return supabaseClient.from("logs").insert(payload);
  }

  async function handleSubmit() {
    setStatus("");
    const categoryId = categorySelect?.value || "";
    const points = Number(pointsInput?.value);
    const note = (notesInput?.value || "").trim();
    const selectedStudents = Array.from(studentContainer?.querySelectorAll('input[type="checkbox"]:checked') || []).map(cb => cb.value);

    if (!categoryId) return setStatus("Please select a category.", "error");
    if (!Number.isInteger(points) || points <= 0) return setStatus("Points must be a positive integer.", "error");
    if (!selectedStudents.length) return setStatus("Select at least one student.", "error");
    if (!selectedDates.size) return setStatus("Select at least one date.", "error");

    const rows = [];
    selectedStudents.forEach(studentId => {
      selectedDates.forEach(dateValue => {
        rows.push({
          studio_id: studioId,
          student_id: studentId,
          teacher_id: authUser.id,
          category_id: categoryId,
          points,
          note,
          log_date: dateValue
        });
      });
    });

    submitBtn.disabled = true;
    let { error } = await insertLogs(rows, "log_date", "student_id");
    if (error && /column .*student_id/i.test(error.message || "")) {
      ({ error } = await insertLogs(rows, "log_date", "user_id"));
    }
    if (error && /column .*log_date/i.test(error.message || "")) {
      ({ error } = await insertLogs(rows, "date", "student_id"));
      if (error && /column .*student_id/i.test(error.message || "")) {
        ({ error } = await insertLogs(rows, "date", "user_id"));
      }
    }
    if (error && /column .*logged_at/i.test(error.message || "")) {
      const isoRows = rows.map(r => ({ ...r, log_date: new Date(r.log_date + "T12:00:00").toISOString() }));
      ({ error } = await insertLogs(isoRows, "logged_at", "student_id"));
      if (error && /column .*student_id/i.test(error.message || "")) {
        ({ error } = await insertLogs(isoRows, "logged_at", "user_id"));
      }
    }

    submitBtn.disabled = false;
    if (error) {
      setStatus(error.message || "Failed to submit logs.", "error");
      return;
    }

    setStatus(`Logged ${rows.length} entries.`, "success");
    clearForm();
  }

  async function init() {
    const url = window.SUPABASE_URL || getMeta("supabase-url");
    const key = window.SUPABASE_ANON_KEY || getMeta("supabase-anon-key");
    if (!url || !key) {
      setStatus("Supabase config missing. Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY or meta tags.", "error");
      return;
    }
    if (!window.supabase?.createClient) {
      setStatus("Supabase client not available.", "error");
      return;
    }
    supabaseClient = window.supabase.createClient(url, key);

    const { data: sessionData, error: sessionErr } = await supabaseClient.auth.getSession();
    const session = sessionData?.session || null;
    if (sessionErr || !session) {
      if (card) card.style.display = "none";
      setStatus("Not logged in", "error");
      return;
    }

    authUser = session.user;
    const { data: profile, error: profileErr } = await supabaseClient
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();
    if (profileErr || !profile) {
      setStatus(profileErr?.message || "Failed to load profile.", "error");
      return;
    }

    const roles = parseRoles(profile.roles);
    if (!roles.includes("teacher") && !roles.includes("admin")) {
      if (card) card.style.display = "none";
      setStatus("Not authorized", "error");
      return;
    }

    studioId = profile.studio_id || localStorage.getItem("activeStudioId");
    if (!studioId) {
      setStatus("Missing studio id.", "error");
      return;
    }

    if (card) card.style.display = "";
    await loadCategories();
    await loadStudents();

    studentSearch?.addEventListener("input", filterStudents);
    addDateBtn?.addEventListener("click", () => {
      addDate(dateInput?.value);
      if (dateInput) dateInput.value = "";
    });
    submitBtn?.addEventListener("click", handleSubmit);
    clearBtn?.addEventListener("click", clearForm);
  }

  init();
})();
