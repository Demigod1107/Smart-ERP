// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// -------------------------------------------------------------
// USER SESSION & THEME MANAGER
// -------------------------------------------------------------
let currentUser = {
  username: 'admin',
  role: 'admin',
  name: 'System Administrator'
};

try {
  const savedUser = localStorage.getItem('smart_current_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
  }
} catch (e) {}

function initUserUI() {
  const badgeEl = document.getElementById('userRoleBadge');
  const nameEl = document.getElementById('userNameLabel');
  if (badgeEl) {
    badgeEl.textContent = currentUser.role.toUpperCase();
    badgeEl.className = `role-pill role-${currentUser.role}`;
  }
  if (nameEl) {
    nameEl.textContent = currentUser.name || currentUser.username;
  }

  // Teacher role class restriction
  if (currentUser.role === 'teacher' && currentUser.assigned_class) {
    const classFilter = document.getElementById('classFilter');
    if (classFilter && classFilter.querySelector(`option[value="${currentUser.assigned_class}"]`)) {
      classFilter.value = currentUser.assigned_class;
    }
  }
}

// Dark Mode Theme Toggle
function initTheme() {
  const savedTheme = localStorage.getItem('smart_school_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.textContent = savedTheme === 'dark' ? '☀️ Light' : '🌓 Dark';
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('smart_school_theme', next);
      toggleBtn.textContent = next === 'dark' ? '☀️ Light' : '🌓 Dark';
      drawAllCharts();
    });
  }
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('smart_auth_token');
    localStorage.removeItem('smart_current_user');
    window.location.href = 'login.html';
  });
}

// -------------------------------------------------------------
// DATE HELPERS
// -------------------------------------------------------------
const dateInput = document.getElementById('attendanceDate');
const today = new Date();
const formatDate = (d) => d.toISOString().split('T')[0];
const todayStr = formatDate(today);
if (dateInput) {
  dateInput.value = todayStr;
}

function getPastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return formatDate(d);
}

const d4 = getPastDate(4);
const d3 = getPastDate(3);
const d2 = getPastDate(2);
const d1 = getPastDate(1);

// Default Seed Students (Offline Fallback)
const defaultStudents = [
  {
    id: 1,
    roll: '10A-01',
    admission_no: 'ADM-2024-001',
    name: 'Aarav Sharma',
    classSec: '10-A',
    phone: '9876543210',
    basePresent: 14,
    baseTotal: 20,
    records: {
      [d4]: 'Present',
      [d3]: 'Present',
      [d2]: 'Late',
      [d1]: 'Absent',
      [todayStr]: 'Absent',
    },
  },
  {
    id: 2,
    roll: '10A-02',
    admission_no: 'ADM-2024-002',
    name: 'Priya Patel',
    classSec: '10-A',
    phone: '9876543211',
    basePresent: 18,
    baseTotal: 20,
    records: {
      [d4]: 'Present',
      [d3]: 'Present',
      [d2]: 'Present',
      [d1]: 'Present',
      [todayStr]: 'Present',
    },
  },
  {
    id: 3,
    roll: '10B-01',
    admission_no: 'ADM-2024-003',
    name: 'Rohan Verma',
    classSec: '10-B',
    phone: '9876543212',
    basePresent: 11,
    baseTotal: 20,
    records: {
      [d4]: 'Absent',
      [d3]: 'Absent',
      [d2]: 'Late',
      [d1]: 'Absent',
      [todayStr]: 'Absent',
    },
  },
  {
    id: 4,
    roll: '10B-02',
    admission_no: 'ADM-2024-004',
    name: 'Sneha Nair',
    classSec: '10-B',
    phone: '9876543213',
    basePresent: 19,
    baseTotal: 20,
    records: {
      [d4]: 'Present',
      [d3]: 'Present',
      [d2]: 'Present',
      [d1]: 'Present',
      [todayStr]: 'Present',
    },
  },
  {
    id: 5,
    roll: '12A-01',
    admission_no: 'ADM-2022-005',
    name: 'Vikram Singh',
    classSec: '12-A',
    phone: '9876543214',
    basePresent: 13,
    baseTotal: 20,
    records: {
      [d4]: 'Present',
      [d3]: 'Late',
      [d2]: 'Absent',
      [d1]: 'Present',
      [todayStr]: 'Late',
    },
  },
  {
    id: 6,
    roll: '12A-02',
    admission_no: 'ADM-2022-006',
    name: 'Ananya Iyer',
    classSec: '12-A',
    phone: '9876543215',
    basePresent: 17,
    baseTotal: 20,
    records: {
      [d4]: 'Present',
      [d3]: 'Present',
      [d2]: 'Present',
      [d1]: 'Present',
      [todayStr]: 'Present',
    },
  },
];

let students = [...defaultStudents];

// Load safely from local storage cache
try {
  const saved = localStorage.getItem('smart_attendance_v3');
  if (saved) {
    students = JSON.parse(saved);
  }
} catch (err) {}

function saveData() {
  try {
    localStorage.setItem('smart_attendance_v3', JSON.stringify(students));
  } catch (err) {}
}

function showMessage(msg) {
  const box = document.getElementById('statusMsg');
  if (box) {
    box.textContent = msg;
    box.hidden = false;
    setTimeout(() => {
      box.hidden = true;
    }, 3000);
  }
  showToast(msg);
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.remove();
  }, 3500);
}

// -------------------------------------------------------------
// ATTENDANCE & 75% ADVISOR MATHEMATICAL FORMULAS
// -------------------------------------------------------------
function getStudentStats(student) {
  let presentDays = Number(student.basePresent ?? student.base_present) || 0;
  let totalDays = Number(student.baseTotal ?? student.base_total) || 0;
  const records = student.records || {};

  for (const date in records) {
    const status = records[date];
    totalDays += 1;
    if (status === 'Present') {
      presentDays += 1;
    } else if (status === 'Late') {
      presentDays += 0.5;
    } else if (status === 'Excused') {
      presentDays += 1;
    }
  }

  const pct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
  return { presentDays, totalDays, pct };
}

function get75Advice(presentDays, totalDays, pct) {
  if (totalDays === 0) return { text: 'No classes yet', type: 'safe' };

  if (pct < 75) {
    const needed = Math.max(1, Math.ceil(3 * totalDays - 4 * presentDays));
    return {
      text: `⚠️ Need next ${needed} classes for 75%`,
      type: 'danger',
    };
  } else {
    const canMiss = Math.floor((4 * presentDays - 3 * totalDays) / 3);
    if (canMiss > 0) {
      return {
        text: `✓ Safe to miss ${canMiss} class${canMiss > 1 ? 'es' : ''}`,
        type: 'safe',
      };
    } else {
      return {
        text: `⚡ Borderline: Cannot miss any`,
        type: 'warning',
      };
    }
  }
}

function getRecentDates() {
  const datesSet = new Set([todayStr, d1, d2, d3, d4]);
  students.forEach((s) => {
    if (s.records) {
      Object.keys(s.records).forEach((d) => datesSet.add(d));
    }
  });
  return Array.from(datesSet).sort().slice(-5);
}

// Speed Roll-Call Mode State
let isSpeedMode = false;
let speedIndex = 0;
let speedFilteredList = [];

// -------------------------------------------------------------
// BACKEND API SYNCHRONIZATION
// -------------------------------------------------------------
async function syncFromBackend() {
  try {
    const classFilterEl = document.getElementById('classFilter');
    const selectedClass = classFilterEl ? classFilterEl.value : 'All';
    const selectedDate = dateInput ? (dateInput.value || todayStr) : todayStr;

    // Fetch dashboard stats
    const statsRes = await fetch(`/api/dashboard/stats?class=${selectedClass}&date=${selectedDate}`);
    if (statsRes.ok) {
      const sData = await statsRes.json();
      if (document.getElementById('todayPeriodCount')) {
        document.getElementById('todayPeriodCount').textContent = sData.todayPeriodAttendanceCount || '0';
      }
      if (document.getElementById('subjRiskCount')) {
        document.getElementById('subjRiskCount').textContent = sData.subjectDefaultersCount || '0';
      }
      if (document.getElementById('commDispatchCount')) {
        document.getElementById('commDispatchCount').textContent = `${sData.pendingCommAlertsCount || 0} Queued, ${sData.failedCommCount || 0} Failed`;
      }
      if (document.getElementById('backupHealthText')) {
        document.getElementById('backupHealthText').textContent = sData.lastBackup 
          ? new Date(sData.lastBackup).toLocaleDateString() 
          : (sData.backupHealth || 'Initial');
      }
    }

    const res = await fetch(`/api/attendance?class=${selectedClass}&date=${selectedDate}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.students && data.students.length > 0) {
      // Map backend student response to memory
      data.students.forEach(bs => {
        const local = students.find(s => s.roll === bs.roll || s.id === bs.id);
        if (local) {
          if (!local.records) local.records = {};
          local.records[selectedDate] = bs.currentStatus;
          local.basePresent = bs.stats.present - (bs.currentStatus === 'Present' ? 1 : bs.currentStatus === 'Late' ? 0.5 : 0);
          local.baseTotal = bs.stats.total - 1;
        }
      });
      saveData();
    }
  } catch (err) {
    // Offline mode, continue using memory and localStorage
  }
}

// -------------------------------------------------------------
// PAGE ROUTER & RENDERERS
// -------------------------------------------------------------
function renderTable() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('students.html')) {
    renderStudentsPage();
  } else if (path.includes('reports.html')) {
    renderReportsPage();
  } else if (path.includes('index.html') || path.endsWith('/') || path === '') {
    renderDashboardPage();
  }
}

// 1. Dashboard Page Renderer (index.html)
function renderDashboardPage() {
  const tbody = document.getElementById('studentTableBody');
  if (!tbody) return;

  const classFilterEl = document.getElementById('classFilter');
  const searchInputEl = document.getElementById('searchInput');
  const filterStatusEl = document.getElementById('filterStatus');
  const dateLabelEl = document.getElementById('dateLabel');

  const selectedClass = classFilterEl ? classFilterEl.value : 'All';
  const selectedDate = dateInput ? (dateInput.value || todayStr) : todayStr;
  const search = searchInputEl ? searchInputEl.value.toLowerCase() : '';
  const statusFilter = filterStatusEl ? filterStatusEl.value : 'All';

  if (dateLabelEl) dateLabelEl.textContent = selectedDate;
  tbody.innerHTML = '';

  const recentDates = getRecentDates();
  const classStudents = students.filter(
    (s) => selectedClass === 'All' || (s.classSec || s.class_sec) === selectedClass,
  );

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let defaulterCount = 0;

  classStudents.forEach((student) => {
    const status = (student.records && student.records[selectedDate]) || 'Unmarked';
    if (status === 'Present') presentCount++;
    else if (status === 'Absent') absentCount++;
    else if (status === 'Late') lateCount++;
    else if (status === 'Excused') excusedCount++;

    const { pct } = getStudentStats(student);
    if (pct < 75) defaulterCount++;
  });

  const total = classStudents.length;
  const weightedPresent = presentCount + lateCount * 0.5 + excusedCount;
  const classRate = total > 0 ? Math.round((weightedPresent / total) * 100) : 0;

  if (document.getElementById('totalCount')) document.getElementById('totalCount').textContent = total;
  if (document.getElementById('presentCount')) document.getElementById('presentCount').textContent = presentCount;
  if (document.getElementById('absentCount')) document.getElementById('absentCount').textContent = absentCount;
  if (document.getElementById('lateCount')) document.getElementById('lateCount').textContent = lateCount;
  if (document.getElementById('excusedCount')) document.getElementById('excusedCount').textContent = excusedCount;
  if (document.getElementById('attendanceRate')) document.getElementById('attendanceRate').textContent = classRate + '%';
  if (document.getElementById('riskCount')) document.getElementById('riskCount').textContent = defaulterCount;

  const visibleStudents = [];

  classStudents.forEach((student) => {
    const dateStatus = (student.records && student.records[selectedDate]) || 'Unmarked';
    const { presentDays, totalDays, pct } = getStudentStats(student);

    const matchesSearch =
      student.name.toLowerCase().includes(search) ||
      student.roll.toLowerCase().includes(search);

    let matchesFilter = false;
    if (statusFilter === 'All') matchesFilter = true;
    else if (statusFilter === 'AtRisk') matchesFilter = pct < 75;
    else matchesFilter = dateStatus === statusFilter;

    if (!matchesSearch || !matchesFilter) return;

    visibleStudents.push(student);
    const realIndex = students.indexOf(student);
    const advice = get75Advice(presentDays, totalDays, pct);

    let trendHtml = '<div class="trend-container">';
    recentDates.forEach((d) => {
      const st = (student.records && student.records[d]) || null;
      let dotClass = 'dot-empty';
      let label = '-';
      if (st === 'Present') {
        dotClass = 'dot-p';
        label = 'P';
      } else if (st === 'Absent') {
        dotClass = 'dot-a';
        label = 'A';
      } else if (st === 'Late') {
        dotClass = 'dot-l';
        label = 'L';
      } else if (st === 'Excused') {
        dotClass = 'dot-p';
        label = 'E';
      }
      trendHtml += `<span class="trend-dot ${dotClass}" title="${d}: ${st || 'Not Recorded'}">${label}</span>`;
    });
    trendHtml += '</div>';

    const isCurrentSpeedTarget =
      isSpeedMode &&
      speedFilteredList[speedIndex] &&
      speedFilteredList[speedIndex].roll === student.roll;

    const tr = document.createElement('tr');
    if (isCurrentSpeedTarget) {
      tr.classList.add('active-speed-row');
    }

    const studentId = student.id || (realIndex + 1);

    tr.innerHTML = `
      <td><strong>${student.roll}</strong></td>
      <td>
        <div><a href="profile.html?id=${studentId}" style="text-decoration:none; color:inherit;"><strong>${student.name}</strong></a></div>
        <small style="color: #64748b;">${student.phone || student.parent_phone ? '📞 ' + (student.phone || student.parent_phone) : 'No phone'}</small>
      </td>
      <td><span class="class-tag">${student.classSec || student.class_sec}</span></td>
      <td><span class="badge badge-${dateStatus}">${dateStatus}</span></td>
      <td>${trendHtml}</td>
      <td>
        <div class="advice-box">
          <span class="advice-pct ${pct < 75 ? 'pct-danger' : 'pct-safe'}">${pct}% (${presentDays}/${totalDays})</span>
          <span class="advice-pill advice-${advice.type}">${advice.text}</span>
        </div>
      </td>
      <td class="actions-cell">
        <button type="button" class="btn btn-sm btn-success" title="Mark Present" onclick="markStatus(${realIndex}, 'Present')">P</button>
        <button type="button" class="btn btn-sm btn-danger" title="Mark Absent" onclick="markStatus(${realIndex}, 'Absent')">A</button>
        <button type="button" class="btn btn-sm btn-warning" title="Mark Late" onclick="markStatus(${realIndex}, 'Late')">L</button>
        <button type="button" class="btn btn-sm btn-primary" title="Mark Excused" onclick="markStatus(${realIndex}, 'Excused')">E</button>
        <button type="button" class="btn btn-sm btn-outline" title="Parent Notice" onclick="openNotifyModal(${realIndex})">📢</button>
        <a href="profile.html?id=${studentId}" class="btn btn-sm btn-outline" title="View Profile">👤</a>
      </td>
    `;
    tbody.appendChild(tr);
  });

  speedFilteredList = visibleStudents;
  if (isSpeedMode) {
    updateSpeedCallUI();
  }

  drawAllCharts();
}

// 2. Students Directory Page Renderer (students.html)
function renderStudentsPage() {
  const tbody = document.getElementById('studentTableBody');
  if (!tbody) return;

  const classFilterEl = document.getElementById('classFilter');
  const searchInputEl = document.getElementById('searchInput');

  const selectedClass = classFilterEl ? classFilterEl.value : 'All';
  const search = searchInputEl ? searchInputEl.value.toLowerCase() : '';

  tbody.innerHTML = '';

  const filtered = students.filter((s) => {
    const cls = s.classSec || s.class_sec;
    const matchesClass = selectedClass === 'All' || cls === selectedClass;
    const matchesSearch =
      s.name.toLowerCase().includes(search) ||
      s.roll.toLowerCase().includes(search) ||
      (s.admission_no && s.admission_no.toLowerCase().includes(search));
    return matchesClass && matchesSearch;
  });

  filtered.forEach((student) => {
    const realIndex = students.indexOf(student);
    const { presentDays, totalDays, pct } = getStudentStats(student);
    const studentId = student.id || (realIndex + 1);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${student.roll}</strong></td>
      <td><span style="font-family:monospace; font-size:0.85rem; color:#64748b;">${student.admission_no || 'ADM-' + student.roll}</span></td>
      <td>
        <a href="profile.html?id=${studentId}" style="text-decoration:none; color:#1e3a8a; font-weight:700;">${student.name}</a>
      </td>
      <td><span class="class-tag">${student.classSec || student.class_sec}</span></td>
      <td>
        <div>${student.parent_name || 'Guardian'}</div>
        <small style="color:#64748b;">${student.phone || student.parent_phone ? '📞 ' + (student.phone || student.parent_phone) : 'No phone'}</small>
      </td>
      <td>
        <span class="advice-pct ${pct < 75 ? 'pct-danger' : 'pct-safe'}">${pct}%</span>
        <small style="color:#64748b;">(${presentDays}/${totalDays} days)</small>
      </td>
      <td>
        <span class="badge ${student.status === 'Archived' ? 'badge-Absent' : 'badge-Present'}">${student.status || 'Active'}</span>
      </td>
      <td class="actions-cell">
        <a href="profile.html?id=${studentId}" class="btn btn-sm btn-primary">Profile</a>
        <button type="button" class="btn btn-sm btn-outline" title="Draft Parent Notice" onclick="openNotifyModal(${realIndex})">📢</button>
        <button type="button" class="btn btn-sm btn-outline" title="Delete Student" onclick="removeStudent(${realIndex})">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 3. Reports & Defaulters Page Renderer (reports.html)
function renderReportsPage() {
  const tbody = document.getElementById('studentTableBody');
  if (!tbody) return;

  const classFilterEl = document.getElementById('classFilter');
  const searchInputEl = document.getElementById('searchInput');
  const filterStatusEl = document.getElementById('filterStatus');

  const selectedClass = classFilterEl ? classFilterEl.value : 'All';
  const search = searchInputEl ? searchInputEl.value.toLowerCase() : '';
  const filterStatus = filterStatusEl ? filterStatusEl.value : 'AtRisk';

  tbody.innerHTML = '';

  const classStudents = students.filter(
    (s) => selectedClass === 'All' || (s.classSec || s.class_sec) === selectedClass,
  );

  let totalCount = classStudents.length;
  let riskCount = 0;
  let safeCount = 0;
  let totalPctSum = 0;

  classStudents.forEach((s) => {
    const { pct } = getStudentStats(s);
    if (pct < 75) riskCount++;
    else safeCount++;
    totalPctSum += pct;
  });

  const avgRate = totalCount > 0 ? Math.round(totalPctSum / totalCount) : 0;

  if (document.getElementById('totalCount')) document.getElementById('totalCount').textContent = totalCount;
  if (document.getElementById('attendanceRate')) document.getElementById('attendanceRate').textContent = avgRate + '%';
  if (document.getElementById('riskCount')) document.getElementById('riskCount').textContent = riskCount;
  if (document.getElementById('safeCount')) document.getElementById('safeCount').textContent = safeCount;

  classStudents.forEach((student) => {
    const { presentDays, totalDays, pct } = getStudentStats(student);
    const advice = get75Advice(presentDays, totalDays, pct);

    const matchesSearch =
      student.name.toLowerCase().includes(search) ||
      student.roll.toLowerCase().includes(search);

    let matchesFilter = true;
    if (filterStatus === 'AtRisk') {
      matchesFilter = pct < 75;
    }

    if (!matchesSearch || !matchesFilter) return;

    const realIndex = students.indexOf(student);
    const studentId = student.id || (realIndex + 1);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${student.roll}</strong></td>
      <td><a href="profile.html?id=${studentId}" style="text-decoration:none; color:inherit;"><strong>${student.name}</strong></a></td>
      <td><span class="class-tag">${student.classSec || student.class_sec}</span></td>
      <td>${student.phone || student.parent_phone ? '📞 ' + (student.phone || student.parent_phone) : 'No phone'}</td>
      <td>
        <span class="advice-pct ${pct < 75 ? 'pct-danger' : 'pct-safe'}">${pct}%</span>
        <small style="color:#64748b;">(${presentDays}/${totalDays})</small>
      </td>
      <td>
        <span class="advice-pill advice-${advice.type}">${advice.text}</span>
      </td>
      <td class="actions-cell">
        <button type="button" class="btn btn-sm btn-primary" onclick="openNotifyModal(${realIndex})">📢 Send Alert</button>
        <a href="profile.html?id=${studentId}" class="btn btn-sm btn-outline">Dossier</a>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Attendance Status Marking (with API sync + audit)
async function markStatus(index, status) {
  const selectedDate = dateInput ? (dateInput.value || todayStr) : todayStr;
  const s = students[index];
  if (!s.records) s.records = {};
  s.records[selectedDate] = status;
  saveData();
  renderTable();

  // Sync to REST backend
  if (s.id) {
    try {
      await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: s.id,
          date: selectedDate,
          status,
          markedBy: currentUser.username || 'User',
          reason: 'Dashboard quick-mark',
        }),
      });
    } catch (e) {}
  }
}

function removeStudent(index) {
  const removed = students[index];
  if (confirm(`Remove student ${removed.name} (${removed.roll})?`)) {
    if (removed.id) {
      fetch(`/api/students/${removed.id}`, { method: 'DELETE' }).catch(() => {});
    }
    students.splice(index, 1);
    saveData();
    renderTable();
    showMessage(`Removed ${removed.name}`);
  }
}

// Speed Roll-Call Mode Handler
function startSpeedMode() {
  if (speedFilteredList.length === 0) {
    showMessage('No students to call in current view!');
    return;
  }
  isSpeedMode = true;
  speedIndex = 0;
  const banner = document.getElementById('speedCallBanner');
  if (banner) banner.style.display = 'flex';
  updateSpeedCallUI();
  renderTable();
}

function exitSpeedMode() {
  isSpeedMode = false;
  const banner = document.getElementById('speedCallBanner');
  if (banner) banner.style.display = 'none';
  renderTable();
}

function updateSpeedCallUI() {
  if (!isSpeedMode) return;
  if (speedIndex >= speedFilteredList.length) {
    showMessage('🎉 Speed roll-call complete for all students in view!');
    exitSpeedMode();
    return;
  }
  const current = speedFilteredList[speedIndex];
  if (document.getElementById('speedStudentName')) {
    document.getElementById('speedStudentName').textContent = current.name;
  }
  if (document.getElementById('speedStudentRoll')) {
    document.getElementById('speedStudentRoll').textContent = `${current.roll} - ${current.classSec || current.class_sec}`;
  }
}

function handleSpeedMark(status) {
  if (!isSpeedMode || speedIndex >= speedFilteredList.length) return;
  const current = speedFilteredList[speedIndex];
  const realIndex = students.indexOf(current);
  if (realIndex !== -1) {
    markStatus(realIndex, status);
  }
  speedIndex++;
  renderTable();
}

// Global Keyboard Hotkeys for Speed Calling (P, A, L, E, Escape)
window.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  if (!activeEl) return;
  const tag = activeEl.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

  if (isSpeedMode) {
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      handleSpeedMark('Present');
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      handleSpeedMark('Absent');
    } else if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      handleSpeedMark('Late');
    } else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      handleSpeedMark('Excused');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitSpeedMode();
    }
  }
});

// Parent Notification Alert Modal
function openNotifyModal(index) {
  const student = students[index];
  const selectedDate = dateInput ? (dateInput.value || todayStr) : todayStr;
  const status = (student.records && student.records[selectedDate]) || 'Unmarked';
  const { pct } = getStudentStats(student);

  let message = `Dear Parent,\nThis is an automated notification from School Attendance Office.\n\nStudent: ${student.name} (Roll No: ${student.roll}, Class: ${student.classSec || student.class_sec})\nDate: ${selectedDate}\nToday's Status: ${status.toUpperCase()}\nCumulative Attendance: ${pct}%\n`;

  if (pct < 75) {
    message += `⚠️ Warning: Attendance is below mandatory 75% threshold. Please ensure regular attendance to avoid exam debarment.\n`;
  } else {
    message += `Attendance status is satisfactory.\n`;
  }
  message += `\nThank you,\nAdministration`;

  const noticeTextEl = document.getElementById('noticeMessageText');
  if (noticeTextEl) noticeTextEl.value = message;

  const phone = (student.phone || student.parent_phone || '').replace(/[^0-9]/g, '');
  const waBtn = document.getElementById('whatsappBtn');
  const encoded = encodeURIComponent(message);
  if (waBtn) {
    if (phone) {
      waBtn.href = `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encoded}`;
    } else {
      waBtn.href = `https://wa.me/?text=${encoded}`;
    }
  }

  const modal = document.getElementById('notifyModal');
  if (modal) modal.style.display = 'flex';
}

function closeNotifyModal() {
  const modal = document.getElementById('notifyModal');
  if (modal) modal.style.display = 'none';
}

if (document.getElementById('closeModalBtn')) {
  document.getElementById('closeModalBtn').addEventListener('click', closeNotifyModal);
}
if (document.getElementById('dismissModalBtn')) {
  document.getElementById('dismissModalBtn').addEventListener('click', closeNotifyModal);
}

if (document.getElementById('copyNoticeBtn')) {
  document.getElementById('copyNoticeBtn').addEventListener('click', () => {
    const textEl = document.getElementById('noticeMessageText');
    if (!textEl) return;
    navigator.clipboard.writeText(textEl.value).then(() => {
      showMessage('✓ Notice copied to clipboard!');
      closeNotifyModal();
    });
  });
}

// -------------------------------------------------------------
// CSV EXPORT FUNCTIONALITY
// -------------------------------------------------------------
function exportAttendanceCSV() {
  const classFilterEl = document.getElementById('classFilter');
  const selectedClass = classFilterEl ? classFilterEl.value : 'All';
  const selectedDate = dateInput ? (dateInput.value || todayStr) : todayStr;

  const classStudents = students.filter(
    (s) => selectedClass === 'All' || (s.classSec || s.class_sec) === selectedClass,
  );

  if (classStudents.length === 0) {
    showMessage('No records to export.');
    return;
  }

  const headers = [
    'Roll Number',
    'Student Name',
    'Class & Section',
    'Parent Phone',
    `Status (${selectedDate})`,
    'Present Days',
    'Total Recorded Days',
    'Attendance %',
    '75% Goal Status',
  ];

  const rows = classStudents.map((s) => {
    const status = (s.records && s.records[selectedDate]) || 'Unmarked';
    const { presentDays, totalDays, pct } = getStudentStats(s);
    const advice = get75Advice(presentDays, totalDays, pct);
    return [
      `"${s.roll}"`,
      `"${s.name}"`,
      `"${s.classSec || s.class_sec}"`,
      `"${s.phone || s.parent_phone || ''}"`,
      `"${status}"`,
      presentDays,
      totalDays,
      `"${pct}%"`,
      `"${advice.text.replace(/"/g, '""')}"`,
    ];
  });

  const csvContent =
    '\uFEFF' +
    [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `Attendance_${selectedClass.replace(' ', '_')}_${selectedDate}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showMessage('📥 CSV Report downloaded successfully!');
}

// Quick Add Student Form Handler
const studentForm = document.getElementById('studentForm');
if (studentForm) {
  studentForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const roll = document.getElementById('rollInput').value.trim().toUpperCase();
    const name = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('parentPhoneInput').value.trim();
    const classSec = document.getElementById('studentClassInput').value;

    if (students.some((s) => s.roll.toUpperCase() === roll)) {
      showMessage('Roll number already exists!');
      return;
    }

    const newObj = {
      roll,
      admission_no: `ADM-${Date.now().toString().slice(-6)}`,
      name,
      classSec,
      phone,
      basePresent: 18,
      baseTotal: 20,
      records: {
        [todayStr]: 'Present',
      },
    };

    // Post to API if online
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newObj),
      });
      const data = await res.json();
      if (data.studentId) newObj.id = data.studentId;
    } catch (e) {}

    students.push(newObj);
    saveData();
    renderTable();
    this.reset();
    showMessage(`Added ${name} (${roll}) to Class ${classSec}`);
  });
}

// Event Listeners for Toolbar & Filters
const classFilterEl = document.getElementById('classFilter');
if (classFilterEl) {
  classFilterEl.addEventListener('change', () => {
    if (isSpeedMode) exitSpeedMode();
    renderTable();
    syncFromBackend();
    loadAiInsights();
  });
}

if (dateInput) {
  dateInput.addEventListener('change', () => {
    if (isSpeedMode) exitSpeedMode();
    renderTable();
    syncFromBackend();
  });
}

const searchInputEl = document.getElementById('searchInput');
if (searchInputEl) {
  searchInputEl.addEventListener('input', renderTable);
}

const filterStatusEl = document.getElementById('filterStatus');
if (filterStatusEl) {
  filterStatusEl.addEventListener('change', renderTable);
}

const startSpeedBtn = document.getElementById('startSpeedBtn');
if (startSpeedBtn) startSpeedBtn.addEventListener('click', startSpeedMode);

const speedExitBtn = document.getElementById('speedExitBtn');
if (speedExitBtn) speedExitBtn.addEventListener('click', exitSpeedMode);

const speedPBtn = document.getElementById('speedPBtn');
if (speedPBtn) speedPBtn.addEventListener('click', () => handleSpeedMark('Present'));

const speedABtn = document.getElementById('speedABtn');
if (speedABtn) speedABtn.addEventListener('click', () => handleSpeedMark('Absent'));

const speedLBtn = document.getElementById('speedLBtn');
if (speedLBtn) speedLBtn.addEventListener('click', () => handleSpeedMark('Late'));

const speedEBtn = document.getElementById('speedEBtn');
if (speedEBtn) speedEBtn.addEventListener('click', () => handleSpeedMark('Excused'));

const markAllBtn = document.getElementById('markAllBtn');
if (markAllBtn) {
  markAllBtn.addEventListener('click', async () => {
    const selectedClass = classFilterEl ? classFilterEl.value : 'All';
    const selectedDate = dateInput ? (dateInput.value || todayStr) : todayStr;
    students.forEach((s) => {
      if (selectedClass === 'All' || (s.classSec || s.class_sec) === selectedClass) {
        if (!s.records) s.records = {};
        s.records[selectedDate] = 'Present';
      }
    });
    saveData();
    renderTable();

    try {
      await fetch('/api/attendance/mark-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classSec: selectedClass, date: selectedDate, status: 'Present' }),
      });
    } catch (e) {}

    showMessage(`Marked all Present for ${selectedDate}`);
  });
}

const resetBtn = document.getElementById('resetBtn');
if (resetBtn) {
  resetBtn.addEventListener('click', async () => {
    const selectedClass = classFilterEl ? classFilterEl.value : 'All';
    const selectedDate = dateInput ? (dateInput.value || todayStr) : todayStr;
    students.forEach((s) => {
      if (
        (selectedClass === 'All' || (s.classSec || s.class_sec) === selectedClass) &&
        s.records
      ) {
        delete s.records[selectedDate];
      }
    });
    saveData();
    renderTable();

    try {
      await fetch('/api/attendance/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classSec: selectedClass, date: selectedDate }),
      });
    } catch (e) {}

    showMessage(`Reset attendance for ${selectedDate}`);
  });
}

const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
  exportBtn.addEventListener('click', exportAttendanceCSV);
}

// -------------------------------------------------------------
// MODULE M: ADVANCED AI INSIGHTS, PREDICTIONS & QR SESSIONS
// -------------------------------------------------------------
async function loadAiInsights() {
  const container = document.getElementById('aiInsightsContainer');
  if (!container) return;

  const classFilterEl = document.getElementById('classFilter');
  const cls = classFilterEl ? classFilterEl.value : 'All';

  try {
    const res = await fetch(`/api/ai/insights?class=${cls}`);
    if (!res.ok) return;
    const data = await res.json();

    let html = '';
    (data.insights || []).forEach(ins => {
      let icon = 'ℹ️';
      let border = '#3b82f6';
      if (ins.type === 'alert') { icon = '🚨'; border = '#dc2626'; }
      if (ins.type === 'positive') { icon = '🌟'; border = '#16a34a'; }
      if (ins.type === 'intervention') { icon = '⚡'; border = '#d97706'; }

      html += `
        <div style="background: rgba(255,255,255,0.7); padding: 8px 12px; border-radius: 6px; border-left: 3px solid ${border};">
          <strong>${icon} ${ins.title}:</strong> ${ins.text}
        </div>
      `;
    });
    container.innerHTML = html || 'Attendance trend is stable.';
  } catch (e) {
    container.innerHTML = 'AI Insights ready (using client analytics).';
  }
}

// Notification Center Modal
const notifBellBtn = document.getElementById('notifBellBtn');
if (notifBellBtn) {
  notifBellBtn.addEventListener('click', async () => {
    const list = document.getElementById('notificationsList');
    list.innerHTML = '<div>Loading notifications...</div>';
    document.getElementById('notifModal').style.display = 'flex';

    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      list.innerHTML = '';
      if (!data.notifications || data.notifications.length === 0) {
        list.innerHTML = '<div style="color:#64748b; padding:10px;">No notifications.</div>';
        return;
      }
      data.notifications.forEach(n => {
        const item = document.createElement('div');
        item.style.padding = '10px 12px';
        item.style.borderRadius = '8px';
        item.style.background = n.is_read ? '#f8fafc' : '#eff6ff';
        item.style.borderLeft = n.is_read ? '3px solid #cbd5e1' : '3px solid #3b82f6';
        item.innerHTML = `
          <strong style="font-size:0.88rem; display:block; color:#1e3a8a;">${n.title}</strong>
          <span style="font-size:0.82rem; color:#475569;">${n.message}</span>
        `;
        list.appendChild(item);
      });
    } catch (e) {}
  });
}

if (document.getElementById('closeNotifModalBtn')) {
  document.getElementById('closeNotifModalBtn').addEventListener('click', () => {
    document.getElementById('notifModal').style.display = 'none';
  });
}
if (document.getElementById('dismissNotifModalBtn')) {
  document.getElementById('dismissNotifModalBtn').addEventListener('click', () => {
    document.getElementById('notifModal').style.display = 'none';
  });
}
if (document.getElementById('markAllNotifReadBtn')) {
  document.getElementById('markAllNotifReadBtn').addEventListener('click', async () => {
    await fetch('/api/notifications/read-all', { method: 'PUT' }).catch(() => {});
    document.getElementById('unreadNotifCount').textContent = '0';
    document.getElementById('notifModal').style.display = 'none';
    showMessage('All notifications marked read');
  });
}

// -------------------------------------------------------------
// STANDALONE NATIVE CANVAS CHART ENGINE (ZERO EXTERNAL DEPS)
// -------------------------------------------------------------
function drawAllCharts() {
  drawWeeklyTrendChart();
  drawDistributionChart();
  drawClassComparisonChart();
}

function drawWeeklyTrendChart() {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const dates = getRecentDates();
  const rates = dates.map(d => {
    let p = 0, tot = 0;
    students.forEach(s => {
      const st = s.records && s.records[d];
      if (st) {
        tot++;
        if (st === 'Present') p += 1;
        if (st === 'Late') p += 0.5;
        if (st === 'Excused') p += 1;
      }
    });
    return tot > 0 ? Math.round((p / tot) * 100) : 75;
  });

  const padLeft = 40;
  const padBottom = 30;
  const padTop = 20;
  const padRight = 20;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  // Grid lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y <= 100; y += 25) {
    const yPos = padTop + plotH - (y / 100) * plotH;
    ctx.moveTo(padLeft, yPos);
    ctx.lineTo(w - padRight, yPos);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${y}%`, 10, yPos + 3);
  }
  ctx.stroke();

  // 75% target threshold line
  const threshY = padTop + plotH - (75 / 100) * plotH;
  ctx.strokeStyle = '#ef4444';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padLeft, threshY);
  ctx.lineTo(w - padRight, threshY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Plot trend line
  if (dates.length > 1) {
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    dates.forEach((d, i) => {
      const x = padLeft + (i / (dates.length - 1)) * plotW;
      const y = padTop + plotH - (rates[i] / 100) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Data points & Labels
    dates.forEach((d, i) => {
      const x = padLeft + (i / (dates.length - 1)) * plotW;
      const y = padTop + plotH - (rates[i] / 100) * plotH;
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${rates[i]}%`, x - 10, y - 8);
      ctx.fillText(d.slice(5), x - 12, h - 10);
    });
  }
}

function drawDistributionChart() {
  const canvas = document.getElementById('distributionChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const selectedDate = dateInput ? (dateInput.value || todayStr) : todayStr;
  let counts = { Present: 0, Absent: 0, Late: 0, Excused: 0 };
  students.forEach(s => {
    const st = s.records && s.records[selectedDate];
    if (st && counts[st] !== undefined) counts[st]++;
  });

  const total = counts.Present + counts.Absent + counts.Late + counts.Excused || 1;
  const colors = {
    Present: '#16a34a',
    Absent: '#dc2626',
    Late: '#d97706',
    Excused: '#2563eb',
  };

  const centerX = w / 2 - 40;
  const centerY = h / 2;
  const radius = 65;

  let startAngle = -Math.PI / 2;
  Object.keys(counts).forEach(k => {
    const sliceAngle = (counts[k] / total) * (Math.PI * 2);
    ctx.fillStyle = colors[k];
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fill();
    startAngle += sliceAngle;
  });

  // Doughnut cutout
  ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#1e293b' : '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 38, 0, Math.PI * 2);
  ctx.fill();

  // Legend
  let legendY = 40;
  Object.keys(counts).forEach(k => {
    ctx.fillStyle = colors[k];
    ctx.fillRect(w - 95, legendY, 12, 12);
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#f8fafc' : '#1e293b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${k} (${counts[k]})`, w - 75, legendY + 10);
    legendY += 24;
  });
}

function drawClassComparisonChart() {
  const canvas = document.getElementById('classComparisonChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const classes = ['10-A', '10-B', '12-A'];
  const padLeft = 40;
  const padBottom = 30;
  const padTop = 20;
  const barWidth = 40;
  const gap = 30;

  // Grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y <= 100; y += 25) {
    const yPos = padTop + (h - padTop - padBottom) - (y / 100) * (h - padTop - padBottom);
    ctx.moveTo(padLeft, yPos);
    ctx.lineTo(w - 20, yPos);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${y}%`, 10, yPos + 3);
  }
  ctx.stroke();

  classes.forEach((cls, i) => {
    const clsStudents = students.filter(s => (s.classSec || s.class_sec) === cls);
    let sumPct = 0;
    clsStudents.forEach(st => {
      const { pct } = getStudentStats(st);
      sumPct += pct;
    });
    const avg = clsStudents.length > 0 ? Math.round(sumPct / clsStudents.length) : 75;

    const x = padLeft + gap + i * (barWidth + gap);
    const barHeight = (avg / 100) * (h - padTop - padBottom);
    const y = padTop + (h - padTop - padBottom) - barHeight;

    ctx.fillStyle = avg >= 75 ? '#2563eb' : '#dc2626';
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#1e293b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${avg}%`, x + 8, y - 5);
    ctx.fillText(cls, x + 8, h - 10);
  });
}

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initUserUI();
  await syncFromBackend();
  renderTable();
  loadAiInsights();
});
