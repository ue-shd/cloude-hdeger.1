const API = "";
let tasks = [];
let currentFilter = "all";
let searchQuery = "";
let categoryFilter = "";
let editingId = null;

const priorityLabel = { high: "高", medium: "中", low: "低" };
const priorityOrder = { high: 0, medium: 1, low: 2 };

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchTasks() {
  const res = await fetch(`${API}/tasks`);
  tasks = await res.json();
  renderAll();
}

async function createTask(data) {
  await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  await fetchTasks();
}

async function updateTask(id, data) {
  await fetch(`${API}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  await fetchTasks();
}

async function deleteTask(id) {
  await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
  await fetchTasks();
}

// ── Date utilities ─────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dueDateStatus(due) {
  if (!due) return null;
  const t = today();
  if (due < t) return "overdue";
  if (due === t) return "today";
  return null;
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderAll() {
  renderStats();
  renderDashboard();
  renderCategoryFilter();
  renderTasks();
}

function renderStats() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const high = tasks.filter((t) => t.priority === "high" && !t.completed).length;
  const overdue = tasks.filter((t) => !t.completed && dueDateStatus(t.due_date) === "overdue").length;
  document.getElementById("stats").innerHTML = `
    <span><span class="dot" style="background:#4ade80"></span> 完了 ${done}/${total}</span>
    ${high > 0 ? `<span><span class="dot" style="background:#f87171"></span> 高優先度 ${high}件</span>` : ""}
    ${overdue > 0 ? `<span><span class="dot" style="background:#f87171"></span> 期限切れ ${overdue}件</span>` : ""}
  `;
}

function renderDashboard() {
  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const total = tasks.length;
  const pct = total ? Math.round((done.length / total) * 100) : 0;

  // Category breakdown
  const catMap = {};
  pending.forEach((t) => {
    const c = t.category || "未分類";
    catMap[c] = (catMap[c] || 0) + 1;
  });
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  document.getElementById("dashboard").innerHTML = `
    <div class="dash-card">
      <div class="dash-label">完了率</div>
      <div class="dash-value">${pct}%</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="dash-card">
      <div class="dash-label">未完了</div>
      <div class="dash-value">${pending.length}</div>
    </div>
    <div class="dash-card">
      <div class="dash-label">完了済み</div>
      <div class="dash-value">${done.length}</div>
    </div>
    <div class="dash-card">
      <div class="dash-label">期限切れ</div>
      <div class="dash-value" style="color:var(--high)">${pending.filter(t => dueDateStatus(t.due_date) === "overdue").length}</div>
    </div>
    ${cats.length ? `
    <div class="dash-card dash-categories">
      <div class="dash-label">カテゴリ別 (未完了)</div>
      ${cats.map(([c, n]) => `
        <div class="cat-row">
          <span class="cat-name">${esc(c)}</span>
          <div class="cat-bar-wrap"><div class="cat-bar" style="width:${Math.round(n/pending.length*100)}%"></div></div>
          <span class="cat-count">${n}</span>
        </div>
      `).join("")}
    </div>` : ""}
  `;
}

function renderCategoryFilter() {
  const cats = [...new Set(tasks.map((t) => t.category).filter(Boolean))].sort();
  const sel = document.getElementById("cat-filter");
  const prev = sel.value;
  sel.innerHTML = `<option value="">全カテゴリ</option>` +
    cats.map((c) => `<option value="${esc(c)}" ${prev === c ? "selected" : ""}>${esc(c)}</option>`).join("");
}

function applyFilters() {
  let list = [...tasks];

  if (currentFilter === "pending") list = list.filter((t) => !t.completed);
  else if (currentFilter === "completed") list = list.filter((t) => t.completed);
  else if (currentFilter === "overdue") list = list.filter((t) => !t.completed && dueDateStatus(t.due_date) === "overdue");

  if (categoryFilter) list = list.filter((t) => t.category === categoryFilter);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q)
    );
  }

  // Sort: incomplete high priority first, then by due date, then by created_at
  list.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pa = priorityOrder[a.priority] ?? 1;
    const pb = priorityOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });

  return list;
}

function renderTasks() {
  const list = document.getElementById("task-list");
  const filtered = applyFilters();

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">タスクがありません</div>`;
    return;
  }

  list.innerHTML = filtered.map((t) => {
    const ds = dueDateStatus(t.due_date);
    const dateClass = ds === "overdue" ? "badge-overdue" : ds === "today" ? "badge-today" : "badge-date";
    const dateLabel = ds === "overdue" ? `⚠️ ${t.due_date} 期限切れ` : ds === "today" ? `🔔 ${t.due_date} 本日` : `📅 ${t.due_date}`;
    const itemClass = `task-item ${t.completed ? "completed" : ""} ${ds && !t.completed ? `task-${ds}` : ""}`;

    return `
      <div class="${itemClass}" data-id="${t.id}">
        <div class="task-check ${t.completed ? "checked" : ""}" onclick="toggleTask(${t.id}, ${!t.completed})"></div>
        <div class="task-body">
          <div class="task-title">${esc(t.title)}</div>
          ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ""}
          <div class="task-meta">
            <span class="badge badge-${t.priority}">${priorityLabel[t.priority]}</span>
            ${t.category ? `<span class="badge badge-category">${esc(t.category)}</span>` : ""}
            ${t.due_date ? `<span class="badge ${dateClass}">${dateLabel}</span>` : ""}
          </div>
        </div>
        <div class="task-actions">
          <button class="task-edit" onclick="openEdit(${t.id})" title="編集">✏️</button>
          <button class="task-delete" onclick="deleteTask(${t.id})" title="削除">✕</button>
        </div>
      </div>
    `;
  }).join("");
}

// ── Edit modal ─────────────────────────────────────────────────────────────

function openEdit(id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  editingId = id;
  document.getElementById("edit-title").value = t.title;
  document.getElementById("edit-description").value = t.description || "";
  document.getElementById("edit-priority").value = t.priority;
  document.getElementById("edit-category").value = t.category || "";
  document.getElementById("edit-due_date").value = t.due_date || "";
  document.getElementById("modal-overlay").style.display = "flex";
}

function closeModal() {
  editingId = null;
  document.getElementById("modal-overlay").style.display = "none";
}

document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingId) return;
  await updateTask(editingId, {
    title: document.getElementById("edit-title").value.trim(),
    description: document.getElementById("edit-description").value.trim(),
    priority: document.getElementById("edit-priority").value,
    category: document.getElementById("edit-category").value.trim(),
    due_date: document.getElementById("edit-due_date").value,
  });
  closeModal();
});

// ── Form ───────────────────────────────────────────────────────────────────

document.getElementById("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    title: document.getElementById("title").value.trim(),
    description: document.getElementById("description").value.trim(),
    priority: document.getElementById("priority").value,
    category: document.getElementById("category").value.trim(),
    due_date: document.getElementById("due_date").value,
  };
  if (!data.title) return;
  await createTask(data);
  e.target.reset();
  document.getElementById("priority").value = "medium";
});

// ── Filters ────────────────────────────────────────────────────────────────

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});

document.getElementById("search").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderTasks();
});

document.getElementById("cat-filter").addEventListener("change", (e) => {
  categoryFilter = e.target.value;
  renderTasks();
});

// ── Toggle / delete (called from HTML) ────────────────────────────────────

async function toggleTask(id, completed) {
  await updateTask(id, { completed });
}

// ── Suggestions ───────────────────────────────────────────────────────────

document.getElementById("suggest-btn").addEventListener("click", async () => {
  const btn = document.getElementById("suggest-btn");
  const box = document.getElementById("suggestions");
  const context = document.getElementById("context").value.trim();

  btn.disabled = true;
  box.innerHTML = `<div class="loading">提案を生成中</div>`;

  try {
    const res = await fetch(`${API}/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    });
    const data = await res.json();
    renderSuggestions(data.suggestions || []);
  } catch {
    box.innerHTML = `<div class="empty">エラーが発生しました。再試行してください。</div>`;
  } finally {
    btn.disabled = false;
  }
});

function renderSuggestions(suggestions) {
  const box = document.getElementById("suggestions");
  if (!suggestions.length) {
    box.innerHTML = `<div class="empty">提案が見つかりませんでした</div>`;
    return;
  }
  box.innerHTML = suggestions.map((s, i) => `
    <div class="suggestion-item">
      <div class="suggestion-title">${esc(s.title)}</div>
      ${s.description ? `<div class="suggestion-desc">${esc(s.description)}</div>` : ""}
      <div class="suggestion-meta">
        <span class="badge badge-${s.priority}">${priorityLabel[s.priority] || s.priority}</span>
        ${s.category ? `<span class="badge badge-category">${esc(s.category)}</span>` : ""}
      </div>
      <button class="btn-add-suggestion" onclick="addSuggestion(${i})">+ タスクに追加</button>
    </div>
  `).join("");
  window._suggestions = suggestions;
}

async function addSuggestion(i) {
  const s = window._suggestions[i];
  if (!s) return;
  await createTask({
    title: s.title,
    description: s.description || "",
    priority: ["high", "medium", "low"].includes(s.priority) ? s.priority : "medium",
    category: s.category || "",
    due_date: "",
  });
  const btns = document.querySelectorAll(".btn-add-suggestion");
  if (btns[i]) { btns[i].textContent = "✓ 追加済み"; btns[i].disabled = true; }
}

// ── Util ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Init ──────────────────────────────────────────────────────────────────

fetchTasks();
