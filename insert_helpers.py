from pathlib import Path
path = Path('manage-users.js')
text = path.read_text()
marker = "function matchesSearch(user)"
if 'function normalizeArray' in text:
    raise SystemExit('helpers already inserted')
insert = """function normalizeArray(value) {
  return ensureArray(value)
    .map(item => (item === undefined || item === null ? "" : String(item).trim()))
    .filter(Boolean);
}

function arraysEqual(a, b) {
  const normA = normalizeArray(a).sort();
  const normB = normalizeArray(b).sort();
  if (normA.length !== normB.length) return false;
  for (let i = 0; i < normA.length; i++) {
    if (normA[i] !== normB[i]) return false;
  }
  return true;
}

function buildOptionLists(users) {
  const roleSet = new Set();
  const teacherMap = new Map();
  users.forEach(user => {
    ensureArray(user.roles).forEach(role => {
      if (role) roleSet.add(role);
    });
    const hasTeacherRole = ensureArray(user.roles).some(
      role => typeof role === "string" && role.toLowerCase() === "teacher"
    );
    if (hasTeacherRole) {
      const label = `${user.firstName || user.first_name || ""} ${user.lastName || user.last_name || ""}`.trim() || user.email || "Teacher";
      if (label) {
        teacherMap.set(label, { value: label, label });
      }
    }
  });
  ROLE_FALLBACKS.forEach(role => roleSet.add(role));
  roleOptions = Array.from(roleSet)
    .filter(Boolean)
    .map(role => ({ value: role, label: role }))
    .sort((a, b) => a.label.localeCompare(b.label));
  teacherOptions = Array.from(teacherMap.values()).sort((a, b) => a.label.localeCompare(b.label));
}

"""
if marker not in text:
    raise SystemExit('marker not found')
text = text.replace(marker, insert + marker, 1)
path.write_text(text)
