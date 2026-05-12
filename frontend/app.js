const API = "";
let tasks = [];
let currentFilter = "all";

const priorityLabel = { high: "高", medium: "中", low: "低" };
const priorityKey = { high: "high", medium: "medium", low: "low" };

async function fetchTasks() {
  const res = await fetch(`${API}/tasks`);
  tasks = await res.json();
  renderTasks();
  renderStats();
}

async function createTask(data) {
  await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  await fetchTasks();
}

async function toggleTask(id, completed) {
  await fetch(`${API}/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  await fetchTasks();
}

async function deleteTask(id) {
  await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
  await fetchTasks();
}

function renderStats() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const high = tasks.filter((t) => t.priority === "high" && !t.completed).length;
  document.getElementById("stats").innerHTML = `
    <span><span class="dot" style="background:#4ade80"></span> 完了 ${done}/${total}</span>
    ${high > 0 ? `<span><span class="dot" style="background:#f87171"></span> 高優先度 ${high}件</span>` : ""}
  `;
}

function renderTasks() {
  const list = document.getElementById("task-list");
  let filtered = tasks;
  if (currentFilter === "pending") filtered = tasks.filter((t) => !t.completed);
  if (currentFilter === "completed") filtered = tasks.filter((t) => t.completed);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">タスクがありません</div>`;
    return;
  }

  list.innerHTML = filtered
    .map((t) => {
      const pClass = `badge badge-${t.priority}`;
      return `
      <div class="task-item ${t.completed ? "completed" : ""}" data-id="${t.id}">
        <div class="task-check ${t.completed ? "checked" : ""}" onclick="toggleTask(${t.id}, ${!t.completed})"></div>
        <div class="task-body">
          <div class="task-title">${esc(t.title)}</div>
          ${t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ""}
          <div class="task-meta">
            <span class="${pClass}">${priorityLabel[t.priority]}</span>
            ${t.category ? `<span class="badge badge-category">${esc(t.category)}</span>` : ""}
            ${t.due_date ? `<span class="badge badge-date">📅 ${t.due_date}</span>` : ""}
          </div>
        </div>
        <button class="task-delete" onclick="deleteTask(${t.id})" title="削除">✕</button>
      </div>
    `;
    })
    .join("");
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});

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
  box.innerHTML = suggestions
    .map(
      (s, i) => `
    <div class="suggestion-item">
      <div class="suggestion-header">
        <div class="suggestion-title">${esc(s.title)}</div>
      </div>
      ${s.description ? `<div class="suggestion-desc">${esc(s.description)}</div>` : ""}
      <div class="suggestion-meta">
        <span class="badge badge-${s.priority}">${priorityLabel[s.priority] || s.priority}</span>
        ${s.category ? `<span class="badge badge-category">${esc(s.category)}</span>` : ""}
      </div>
      <button class="btn-add-suggestion" onclick="addSuggestion(${i})">+ タスクに追加</button>
    </div>
  `
    )
    .join("");
  window._suggestions = suggestions;
}

async function addSuggestion(i) {
  const s = window._suggestions[i];
  if (!s) return;
  await createTask({
    title: s.title,
    description: s.description || "",
    priority: priorityKey[s.priority] || "medium",
    category: s.category || "",
    due_date: "",
  });
  // Visually mark as added
  const btns = document.querySelectorAll(".btn-add-suggestion");
  if (btns[i]) {
    btns[i].textContent = "✓ 追加済み";
    btns[i].disabled = true;
  }
}

// Init
fetchTasks();
