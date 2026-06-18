const state = {
  token: localStorage.getItem("studentManagementToken") || "",
  user: JSON.parse(localStorage.getItem("studentManagementUser") || "null"),
  students: [],
  analytics: null
};

const authView = document.querySelector("#authView");
const appView = document.querySelector("#appView");
const loginTab = document.querySelector("#loginTab");
const registerTab = document.querySelector("#registerTab");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const authMessage = document.querySelector("#authMessage");
const userName = document.querySelector("#userName");
const logoutBtn = document.querySelector("#logoutBtn");
const studentForm = document.querySelector("#studentForm");
const studentSubmitBtn = document.querySelector("#studentSubmitBtn");
const resetFormBtn = document.querySelector("#resetFormBtn");
const studentMessage = document.querySelector("#studentMessage");
const studentRows = document.querySelector("#studentRows");
const totalStudents = document.querySelector("#totalStudents");
const averageMarks = document.querySelector("#averageMarks");
const passPercentage = document.querySelector("#passPercentage");
const topPerformer = document.querySelector("#topPerformer");
const topPerformers = document.querySelector("#topPerformers");

loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));
loginForm.addEventListener("submit", handleLogin);
registerForm.addEventListener("submit", handleRegister);
logoutBtn.addEventListener("click", logout);
studentForm.addEventListener("submit", saveStudent);
resetFormBtn.addEventListener("click", resetStudentForm);

init();

async function init() {
  if (!state.token) {
    showAuth();
    return;
  }

  try {
    const response = await api("/api/auth/me");
    state.user = response.user;
    persistAuth();
    await loadDashboard();
    showApp();
  } catch {
    logout();
  }
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  loginTab.classList.toggle("active", isLogin);
  registerTab.classList.toggle("active", !isLogin);
  loginForm.classList.toggle("hidden", !isLogin);
  registerForm.classList.toggle("hidden", isLogin);
  setMessage(authMessage, "");
}

async function handleLogin(event) {
  event.preventDefault();
  const data = formData(loginForm);

  try {
    const response = await api("/api/auth/login", {
      method: "POST",
      body: data,
      auth: false
    });
    setSession(response);
    await loadDashboard();
    showApp();
  } catch (error) {
    setMessage(authMessage, error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const data = formData(registerForm);

  try {
    const response = await api("/api/auth/register", {
      method: "POST",
      body: data,
      auth: false
    });
    setSession(response);
    await loadDashboard();
    showApp();
  } catch (error) {
    setMessage(authMessage, error.message);
  }
}

async function loadDashboard() {
  const [studentsResponse, analyticsResponse] = await Promise.all([
    api("/api/students"),
    api("/api/analytics")
  ]);

  state.students = studentsResponse.students;
  state.analytics = analyticsResponse;
  renderDashboard();
}

function renderDashboard() {
  const summary = state.analytics.summary;
  totalStudents.textContent = summary.totalStudents;
  averageMarks.textContent = summary.averageMarks;
  passPercentage.textContent = `${summary.passPercentage}%`;
  topPerformer.textContent = state.analytics.topPerformers[0]?.name || "None";
  renderStudents();
  renderTopPerformers();
  renderCharts();
}

function renderStudents() {
  if (!state.students.length) {
    studentRows.innerHTML = `<tr><td colspan="6">No students yet.</td></tr>`;
    return;
  }

  studentRows.innerHTML = state.students.map((student) => `
    <tr>
      <td>${escapeHtml(student.name)}</td>
      <td>${escapeHtml(student.rollNo)}</td>
      <td>${escapeHtml(student.className)}</td>
      <td>${student.marks}</td>
      <td><span class="status ${student.status === "Fail" ? "fail" : ""}">${student.status}</span></td>
      <td>
        <div class="actions">
          <button class="small" type="button" data-action="edit" data-id="${student.id}">Edit</button>
          <button class="danger small" type="button" data-action="delete" data-id="${student.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");

  studentRows.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const student = state.students.find((item) => item.id === button.dataset.id);
      if (button.dataset.action === "edit") editStudent(student);
      if (button.dataset.action === "delete") deleteStudent(student);
    });
  });
}

function renderTopPerformers() {
  topPerformers.innerHTML = state.analytics.topPerformers.map((student) => {
    return `<li>${escapeHtml(student.name)} - ${student.marks} marks</li>`;
  }).join("") || "<li>No students yet</li>";
}

async function saveStudent(event) {
  event.preventDefault();
  const data = formData(studentForm);
  const editing = Boolean(data.id);

  try {
    await api(editing ? `/api/students/${data.id}` : "/api/students", {
      method: editing ? "PUT" : "POST",
      body: {
        name: data.name,
        rollNo: data.rollNo,
        className: data.className,
        marks: Number(data.marks)
      }
    });

    setMessage(studentMessage, editing ? "Student updated successfully" : "Student added successfully", true);
    resetStudentForm();
    await loadDashboard();
  } catch (error) {
    setMessage(studentMessage, error.message);
  }
}

function editStudent(student) {
  studentForm.elements.id.value = student.id;
  studentForm.elements.name.value = student.name;
  studentForm.elements.rollNo.value = student.rollNo;
  studentForm.elements.className.value = student.className;
  studentForm.elements.marks.value = student.marks;
  studentSubmitBtn.textContent = "Edit Student";
  document.querySelector(".management h2").textContent = "Edit Student";
  setMessage(studentMessage, "");
}

async function deleteStudent(student) {
  if (!confirm(`Delete ${student.name}?`)) return;

  try {
    await api(`/api/students/${student.id}`, { method: "DELETE" });
    setMessage(studentMessage, "Student deleted successfully", true);
    resetStudentForm();
    await loadDashboard();
  } catch (error) {
    setMessage(studentMessage, error.message);
  }
}

function resetStudentForm() {
  studentForm.reset();
  studentForm.elements.id.value = "";
  studentSubmitBtn.textContent = "Add Student";
  document.querySelector(".management h2").textContent = "Add Student";
}

function renderCharts() {
  drawBarChart(document.querySelector("#barChart"), state.analytics.charts.classAverages);
  drawPieChart(document.querySelector("#pieChart"), state.analytics.charts.passFail);
  drawLineChart(document.querySelector("#lineChart"), state.analytics.charts.monthlyAdmissions);
}

function drawBarChart(canvas, data) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas;
  clearChart(ctx, width, height);
  drawNoData(ctx, width, height, data);
  if (!data.length) return;

  const padding = 44;
  const chartHeight = height - padding * 1.6;
  const max = Math.max(100, ...data.map((item) => item.value));
  const barWidth = (width - padding * 2) / data.length - 16;

  ctx.strokeStyle = "#dbe3ef";
  ctx.beginPath();
  ctx.moveTo(padding, 20);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - 20, height - padding);
  ctx.stroke();

  data.forEach((item, index) => {
    const x = padding + index * (barWidth + 16) + 12;
    const barHeight = (item.value / max) * chartHeight;
    const y = height - padding - barHeight;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#17202a";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(item.label, x + barWidth / 2, height - 18);
    ctx.fillText(item.value, x + barWidth / 2, y - 8);
  });
}

function drawPieChart(canvas, data) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas;
  clearChart(ctx, width, height);
  drawNoData(ctx, width, height, data.filter((item) => item.value > 0));
  if (!data.some((item) => item.value > 0)) return;

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const colors = ["#059669", "#dc2626"];
  const cx = width * 0.34;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.32;
  let start = -Math.PI / 2;

  data.forEach((item, index) => {
    const angle = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = colors[index];
    ctx.fill();
    start += angle;
  });

  data.forEach((item, index) => {
    const x = width * 0.68;
    const y = height / 2 - 24 + index * 42;
    ctx.fillStyle = colors[index];
    ctx.fillRect(x, y - 14, 22, 22);
    ctx.fillStyle = "#17202a";
    ctx.font = "15px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`${item.label}: ${item.value}`, x + 34, y + 3);
  });
}

function drawLineChart(canvas, data) {
  const ctx = setupCanvas(canvas);
  const { width, height } = canvas;
  clearChart(ctx, width, height);
  drawNoData(ctx, width, height, data);
  if (!data.length) return;

  const padding = 44;
  const max = Math.max(1, ...data.map((item) => item.value));
  const step = data.length === 1 ? 0 : (width - padding * 2) / (data.length - 1);
  const points = data.map((item, index) => ({
    x: data.length === 1 ? width / 2 : padding + index * step,
    y: height - padding - (item.value / max) * (height - padding * 1.6),
    ...item
  }));

  ctx.strokeStyle = "#dbe3ef";
  ctx.beginPath();
  ctx.moveTo(padding, 20);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - 20, height - padding);
  ctx.stroke();

  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  points.forEach((point) => {
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#17202a";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(point.label, point.x, height - 18);
    ctx.fillText(point.value, point.x, point.y - 10);
  });
}

function setupCanvas(canvas) {
  const cssWidth = canvas.clientWidth || canvas.width;
  const cssHeight = Math.round(cssWidth * (260 / 560));
  canvas.width = cssWidth;
  canvas.height = cssHeight;
  return canvas.getContext("2d");
}

function clearChart(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

function drawNoData(ctx, width, height, data) {
  if (data.length) return;
  ctx.fillStyle = "#64748b";
  ctx.font = "15px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("No data available", width / 2, height / 2);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  const useAuth = options.auth !== false;

  if (useAuth && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

function setSession(response) {
  state.token = response.token;
  state.user = response.user;
  persistAuth();
}

function persistAuth() {
  localStorage.setItem("studentManagementToken", state.token);
  localStorage.setItem("studentManagementUser", JSON.stringify(state.user));
}

function logout() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("studentManagementToken");
  localStorage.removeItem("studentManagementUser");
  showAuth();
}

function showAuth() {
  authView.classList.remove("hidden");
  appView.classList.add("hidden");
}

function showApp() {
  userName.textContent = state.user ? state.user.name : "";
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setMessage(element, text, success = false) {
  element.textContent = text;
  element.classList.toggle("success", success);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
