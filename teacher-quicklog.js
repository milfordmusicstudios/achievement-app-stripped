(() => {
  const card = document.getElementById("quick-log-card");
  const categorySelect = document.getElementById("qlCategory");
  const pointsInput = document.getElementById("qlPoints");
  const dateInput = document.getElementById("qlDateInput");
  const addDateBtn = document.getElementById("qlAddDateBtn");
  const datesContainer = document.getElementById("qlDates");
  const studentSearch = document.getElementById("qlStudentSearch");
  const studentsContainer = document.getElementById("qlStudents");
  const noteInput = document.getElementById("qlNote");
  const submitBtn = document.getElementById("qlSubmitBtn");
  const clearBtn = document.getElementById("qlClearBtn");
  const statusEl = document.getElementById("qlStatus");

  const selectedDates = new Set();
  let studentsCache = [];
  let studioId = null;
  let currentUser = null;
  const createClient = window.supabase?.createClient;
  let supabase = null;

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#c62828" : "#0b7a3a";
  }

  function getMeta(name) {
    return document.querySelector(`meta[name="${name}"]`)?.content || "";
  }

  function parseRoles(raw) {
    if (Array.isArray(raw)) return raw.map(r => String(r).toLowerCase());
    if (typeof raw === "string") {
      return raw.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
    }
    return [];
  }

  function renderStudents(list) {
    if (!studentsContainer) return;
    studentsContainer.innerHTML = "";
    if (!list.length) {
      studentsContainer.textContent = "No students found.";
      return;
    }
    list.forEach(student => {
      const label = document.createElement("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "8px";
      label.style.marginBottom = "6px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = student.id;
      const name = `${student.lastName || student.last_name || ""}, ${student.firstName || student.first_name || ""}`
        .replace(/^,\s*/, "")
        .trim() || "Student";
      const span = document.createElement("span");
      span.textContent = name;
      label.appendChild(cb);
      label.appendChild(span);
      studentsContainer.appendChild(label);
    });
  }

  function filterStudents() {
    const term = (studentSearch?.value || "").trim().toLowerCase();
    if (!term) {
      renderStudents(studentsCache);
      return;
    }
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
    chip.style.marginRight = "6px";
    chip.textContent = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.style.border = "none";
    remove.style.background = "transparent";
    remove.style.cursor = "pointer";
    remove.addEventListener("click", () => {
      selectedDates.delete(value);
      chip.remove();
    });
    chip.appendChild(remove);
    datesContainer?.appendChild(chip);
  }

  function clearSelections() {
    selectedDates.clear();
    if (datesContainer) datesContainer.innerHTML = "";
    if (studentsContainer) {
      studentsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
      });
    }
    if (noteInput) noteInput.value = "";
    setStatus("");
  }

  async function loadCategories() {
    if (!categorySelect) return;
    categorySelect.innerHTML = '<option value="">Select category...</option>';
    let { data, error } = await supabase
      .from("categories")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      ({ data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name", { ascending: true }));
    }

    if (error) {
      setStatus(error.message || "Failed to load categories.", true);
      return;
    }

    (data || []).forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  async function loadStudents() {
    if (!studioId) return;
    const base = supabase
      .from("users")
      .select("id, firstName, lastName, first_name, last_name, roles, studio_id")
      .eq("studio_id", studioId);

    let { data, error } = await base
      .contains("roles", ["student"])
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (error || !data?.length) {
      ({ data, error } = await base
        .ilike("roles", "%student%")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true }));
    }

    if (error) {
      setStatus(error.message || "Failed to load students.", true);
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

  function buildRows(studentField, dateField) {
    const categoryId = categorySelect?.value || "";
    const points = Number(pointsInput?.value);
    const note = (noteInput?.value || "").trim();
    const selectedStudents = Array.from(
      studentsContainer?.querySelectorAll('input[type="checkbox"]:checked') || []
    ).map(cb => cb.value);

    const rows = [];
    selectedStudents.forEach(studentId => {
      selectedDates.forEach(dateValue => {
        const row = {
          studio_id: studioId,
          teacher_id: currentUser.id,
          category_id: categoryId,
          points,
          note
        };
        row[studentField] = studentId;
        if (dateField === "logged_at") {
          row[dateField] = new Date(`${dateValue}T12:00:00`).toISOString();
        } else {
          row[dateField] = dateValue;
        }
        rows.push(row);
      });
    });
    return rows;
  }

  async function insertWithFallback() {
    const attempts = [
      { studentField: "student_id", dateField: "log_date" },
      { studentField: "user_id", dateField: "log_date" },
      { studentField: "student_id", dateField: "logged_at" },
      { studentField: "user_id", dateField: "logged_at" }
    ];

    let lastError = null;
    for (const attempt of attempts) {
      const rows = buildRows(attempt.studentField, attempt.dateField);
      const { error } = await supabase.from("logs").insert(rows);
      if (!error) return { ok: true, count: rows.length };
      lastError = error;
      const msg = String(error.message || "");
      if (msg.includes("log_date") || msg.includes("logged_at") || msg.includes("student_id") || msg.includes("user_id")) {
        continue;
      }
      break;
    }
    return { ok: false, error: lastError };
  }

  async function handleSubmit() {
    setStatus("");
    const categoryId = categorySelect?.value || "";
    const points = Number(pointsInput?.value);
    const selectedStudents = Array.from(
      studentsContainer?.querySelectorAll('input[type="checkbox"]:checked') || []
    ).map(cb => cb.value);

    if (!categoryId) return setStatus("Select a category.", true);
    if (!Number.isInteger(points) || points <= 0) return setStatus("Points must be a positive integer.", true);
    if (!selectedStudents.length) return setStatus("Select at least one student.", true);
    if (!selectedDates.size) return setStatus("Add at least one date.", true);

    submitBtn.disabled = true;
    const result = await insertWithFallback();
    submitBtn.disabled = false;

    if (!result.ok) {
      setStatus(result.error?.message || "Failed to submit logs.", true);
      return;
    }

    setStatus(`Logged ${result.count} entries.`);
    clearSelections();
  }

  async function init() {
    if (!card) return;
    const url = window.SUPABASE_URL || getMeta("supabase-url");
    const key = window.SUPABASE_ANON_KEY || getMeta("supabase-anon-key");

    if (window.supabase?.auth) {
      supabase = window.supabase;
    } else {
      if (!url || !key) {
        setStatus("Supabase config missing.", true);
        return;
      }

      if (!createClient) {
        setStatus("Supabase client unavailable.", true);
        return;
      }

      supabase = createClient(url, key);
    }

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const session = sessionData?.session || null;
    if (sessionErr || !session) {
      card.style.display = "none";
      setStatus("Not logged in", true);
      return;
    }

    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (profileErr || !profile) {
      setStatus(profileErr?.message || "Failed to load profile.", true);
      return;
    }

    currentUser = profile;
    const roles = parseRoles(profile.roles);
    if (!roles.includes("teacher") && !roles.includes("admin")) {
      card.style.display = "none";
      return;
    }

    studioId = profile.studio_id;
    if (!studioId) {
      setStatus("Missing studio id.", true);
      return;
    }

    card.style.display = "";
    await loadCategories();
    await loadStudents();

    studentSearch?.addEventListener("input", filterStudents);
    addDateBtn?.addEventListener("click", () => {
      addDate(dateInput?.value);
      if (dateInput) dateInput.value = "";
    });
    submitBtn?.addEventListener("click", handleSubmit);
    clearBtn?.addEventListener("click", clearSelections);
  }

  window.addEventListener("load", () => {
    init();
  });
})();
