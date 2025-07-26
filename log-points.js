import { supabase } from './supabase.js';

// Inline categories (replace with your real list)
const categories = ["Practice", "Performance", "Workshop", "Challenge"];

// Populate category dropdown with icons (if you use them)
function populateCategoryDropdown() {
  const dropdown = document.getElementById('logCategory');
  dropdown.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    dropdown.appendChild(opt);
  });
}

// Populate students for admin/teacher; lock to self for students
async function populateStudentDropdown(user) {
  const studentRow = document.getElementById('studentRow');
  const studentSelect = document.getElementById('logStudent');
  studentSelect.innerHTML = '';

  if (Array.isArray(user.roles) && (user.roles.includes('admin') || user.roles.includes('teacher'))) {
    const { data: students, error } = await supabase
      .from('users')
      .select('id, firstName, lastName')
      .contains('roles', ['student']);
    if (error) console.error('Error fetching students:', error);
    else students.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.firstName} ${s.lastName}`;
      studentSelect.appendChild(opt);
    });
    studentRow.style.display = 'table-row';
  } else {
    const opt = document.createElement('option');
    opt.value = user.id;
    opt.textContent = `${user.firstName} ${user.lastName}`;
    studentSelect.appendChild(opt);
    studentRow.style.display = 'none';
  }
}

// Submit log to Supabase
async function submitLog(user) {
  const studentId = document.getElementById('logStudent').value;
  const category = document.getElementById('logCategory').value;
  const points = parseInt(document.getElementById('logPoints').value) || 0;
  const note = document.getElementById('logNote').value.trim();
  const date = document.getElementById('logDate')?.value || new Date().toISOString();

  if (!category || points <= 0) {
    alert('Please select a category and enter valid points.');
    return;
  }

  const logData = { userId: studentId, category, points, note, date };
  console.log('[DEBUG] Submitting log:', logData);

  const { error } = await supabase.from('logs').insert([logData]);
  if (error) {
    console.error('Error inserting log:', error);
    alert('Failed to submit log.');
    return;
  }
  alert('Log submitted successfully!');
  document.getElementById('logForm').reset();
}

// Initialize the log points page
async function initLogPoints() {
  const user = JSON.parse(localStorage.getItem('loggedInUser'));
  if (!user) {
    alert('You must be logged in.');
    window.location.href = 'index.html';
    return;
  }

  populateCategoryDropdown();
  await populateStudentDropdown(user);

  // Button and form listeners
  document.getElementById('homeBtn').addEventListener('click', () => window.location.href = 'index.html');
  document.getElementById('cancelBtn').addEventListener('click', () => window.location.href = 'index.html');
  document.getElementById('logForm').addEventListener('submit', e => {
    e.preventDefault();
    submitLog(user);
  });
}

document.addEventListener('DOMContentLoaded', initLogPoints);
