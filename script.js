/* ---------- Config ---------- */
const CATEGORIES = [
  { id: "food",       label: "Food & Dining",  color: "#FF6B5B" },
  { id: "transport",  label: "Transport",      color: "#3E92CC" },
  { id: "shopping",   label: "Shopping",       color: "#7048E8" },
  { id: "bills",      label: "Bills & Utils",  color: "#FFB627" },
  { id: "entertain",  label: "Entertainment",  color: "#E85D9E" },
  { id: "health",     label: "Health",         color: "#17A673" },
  { id: "other",      label: "Other",          color: "#7A8194" },
];
const STORAGE_KEY = "pocketLedger.expenses.v1";

/* ---------- State ---------- */
let expenses = loadExpenses();
let selectedCategory = CATEGORIES[0].id;
let donutRange = "month";
let trendRange = "week";
let searchTerm = "";

/* ---------- Storage ---------- */
function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load expenses", e);
    return [];
  }
}
function saveExpenses() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch (e) {
    console.error("Failed to save expenses", e);
    alert("Couldn't save — your browser storage might be full or blocked.");
  }
}

/* ---------- Helpers ---------- */
const fmt = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmt2 = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().slice(0, 10);
const catInfo = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

function isToday(dateStr) { return dateStr === todayStr(); }
function isThisMonth(dateStr) {
  const d = new Date(dateStr), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}
function isThisYear(dateStr) {
  return new Date(dateStr).getFullYear() === new Date().getFullYear();
}

/* ---------- Init form ---------- */
function initForm() {
  document.getElementById("date").value = todayStr();
  const picker = document.getElementById("categoryPicker");
  picker.innerHTML = CATEGORIES.map(c => `
    <button type="button" class="cat-chip ${c.id === selectedCategory ? "selected" : ""}"
      data-cat="${c.id}" style="--dot:${c.color}">
      <span class="dot"></span>${c.label}
    </button>
  `).join("");
  picker.querySelectorAll(".cat-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedCategory = btn.dataset.cat;
      picker.querySelectorAll(".cat-chip").forEach(b => b.classList.toggle("selected", b === btn));
    });
  });
}

document.getElementById("expenseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById("amount").value);
  const date = document.getElementById("date").value || todayStr();
  const note = document.getElementById("note").value.trim();
  if (!amount || amount <= 0) return;

  expenses.push({
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    amount, date, note, category: selectedCategory,
  });
  saveExpenses();
  document.getElementById("amount").value = "";
  document.getElementById("note").value = "";
  document.getElementById("date").value = todayStr();
  renderAll();
});

/* ---------- Summary cards ---------- */
function renderSummary() {
  const today = expenses.filter(e => isToday(e.date));
  const month = expenses.filter(e => isThisMonth(e.date));
  const year = expenses.filter(e => isThisYear(e.date));

  const sum = (arr) => arr.reduce((s, e) => s + e.amount, 0);
  const daysSoFarInMonth = new Date().getDate();

  document.getElementById("sumToday").textContent = fmt(sum(today));
  document.getElementById("todayCount").textContent = `${today.length} ${today.length === 1 ? "entry" : "entries"}`;

  document.getElementById("sumMonth").textContent = fmt(sum(month));
  document.getElementById("monthCount").textContent = `${month.length} ${month.length === 1 ? "entry" : "entries"}`;

  document.getElementById("sumYear").textContent = fmt(sum(year));
  document.getElementById("yearCount").textContent = `${year.length} ${year.length === 1 ? "entry" : "entries"}`;

  document.getElementById("sumAvg").textContent = fmt(sum(month) / daysSoFarInMonth);
}

/* ---------- Donut (category breakdown) ---------- */
let categoryChart = null;
function filterByRange(range) {
  if (range === "month") return expenses.filter(e => isThisMonth(e.date));
  if (range === "year") return expenses.filter(e => isThisYear(e.date));
  return expenses;
}
function renderDonut() {
  const data = filterByRange(donutRange);
  const totals = {};
  CATEGORIES.forEach(c => totals[c.id] = 0);
  data.forEach(e => { totals[e.category] = (totals[e.category] || 0) + e.amount; });

  const active = CATEGORIES.filter(c => totals[c.id] > 0);
  const total = data.reduce((s, e) => s + e.amount, 0);
  document.getElementById("donutCenter").querySelector(".donut-total").textContent = "₹" + fmt(total);

  const ctx = document.getElementById("categoryChart");
  const chartData = {
    labels: active.map(c => c.label),
    datasets: [{
      data: active.map(c => totals[c.id]),
      backgroundColor: active.map(c => c.color),
      borderWidth: 3,
      borderColor: "#ffffff",
      hoverOffset: 6,
    }],
  };

  if (categoryChart) {
    categoryChart.data = chartData;
    categoryChart.update();
  } else {
    categoryChart = new Chart(ctx, {
      type: "doughnut",
      data: chartData,
      options: {
        cutout: "68%",
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: (ctx) => ` ${ctx.label}: ₹${fmt(ctx.raw)}` }
        }},
        animation: { duration: 500 },
      },
    });
  }

  const legend = document.getElementById("categoryLegend");
  if (active.length === 0) {
    legend.innerHTML = `<span class="legend-item">No expenses in this range yet</span>`;
  } else {
    legend.innerHTML = active
      .sort((a, b) => totals[b.id] - totals[a.id])
      .map(c => `<span class="legend-item"><span class="dot" style="background:${c.color}"></span>${c.label} · ₹${fmt(totals[c.id])}</span>`)
      .join("");
  }
}

/* ---------- Trend chart ---------- */
let trendChart = null;
function renderTrend() {
  let labels = [], values = [];
  const now = new Date();

  if (trendRange === "week" || trendRange === "month") {
    const days = trendRange === "week" ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      const dayTotal = expenses.filter(e => e.date === dStr).reduce((s, e) => s + e.amount, 0);
      labels.push(d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }));
      values.push(dayTotal);
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthTotal = expenses.filter(e => {
        const ed = new Date(e.date);
        return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
      }).reduce((s, e) => s + e.amount, 0);
      labels.push(d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }));
      values.push(monthTotal);
    }
  }

  const ctx = document.getElementById("trendChart");
  const gradient = ctx.getContext("2d").createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, "rgba(112,72,232,0.35)");
  gradient.addColorStop(1, "rgba(112,72,232,0.02)");

  const chartData = {
    labels,
    datasets: [{
      data: values,
      borderColor: "#7048E8",
      backgroundColor: gradient,
      fill: true,
      tension: 0.35,
      pointRadius: values.length > 20 ? 0 : 3,
      pointBackgroundColor: "#7048E8",
      borderWidth: 2.5,
    }],
  };

  if (trendChart) {
    trendChart.data = chartData;
    trendChart.update();
  } else {
    trendChart = new Chart(ctx, {
      type: "line",
      data: chartData,
      options: {
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: (ctx) => ` ₹${fmt(ctx.raw)}` }
        }},
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => "₹" + fmt(v), font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "#EFEBF7" } },
          x: { ticks: { font: { family: "Inter", size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
        },
        animation: { duration: 500 },
      },
    });
  }
}

/* ---------- Transaction list ---------- */
function renderList() {
  let data = [...expenses].sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  if (searchTerm) {
    const t = searchTerm.toLowerCase();
    data = data.filter(e =>
      (e.note || "").toLowerCase().includes(t) ||
      catInfo(e.category).label.toLowerCase().includes(t)
    );
  }

  const list = document.getElementById("txList");
  const empty = document.getElementById("emptyState");

  if (data.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    empty.textContent = expenses.length === 0
      ? "No expenses yet — the ledger is empty. Add your first one above ↑"
      : "No entries match your search.";
    return;
  }
  empty.hidden = true;

  list.innerHTML = data.slice(0, 200).map(e => {
    const c = catInfo(e.category);
    const dateLabel = new Date(e.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    return `
      <div class="tx-row" data-id="${e.id}">
        <div class="tx-dot" style="background:${c.color}">${c.label.charAt(0)}</div>
        <div class="tx-info">
          <div class="tx-cat">${c.label}</div>
          ${e.note ? `<div class="tx-note">${escapeHtml(e.note)}</div>` : ""}
        </div>
        <div class="tx-date">${dateLabel}</div>
        <div style="display:flex; align-items:center;">
          <span class="tx-amount">₹${fmt2(e.amount)}</span>
          <button class="tx-del" title="Delete entry" aria-label="Delete entry" data-id="${e.id}">✕</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".tx-del").forEach(btn => {
    btn.addEventListener("click", () => {
      expenses = expenses.filter(e => e.id !== btn.dataset.id);
      saveExpenses();
      renderAll();
    });
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/* ---------- Toggles ---------- */
document.getElementById("donutRangeToggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".range-btn");
  if (!btn) return;
  donutRange = btn.dataset.range;
  document.querySelectorAll("#donutRangeToggle .range-btn").forEach(b => b.classList.toggle("active", b === btn));
  renderDonut();
});
document.getElementById("trendRangeToggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".range-btn");
  if (!btn) return;
  trendRange = btn.dataset.range;
  document.querySelectorAll("#trendRangeToggle .range-btn").forEach(b => b.classList.toggle("active", b === btn));
  renderTrend();
});
document.getElementById("searchBox").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderList();
});

/* ---------- Export / Reset ---------- */
document.getElementById("exportBtn").addEventListener("click", () => {
  if (expenses.length === 0) { alert("No expenses to export yet."); return; }
  const rows = [["Date", "Category", "Amount", "Note"]];
  [...expenses].sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    rows.push([e.date, catInfo(e.category).label, e.amount, (e.note || "").replace(/,/g, ";")]);
  });
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pocket-ledger-${todayStr()}.csv`;
  a.click();
});

document.getElementById("resetBtn").addEventListener("click", () => {
  if (expenses.length === 0) return;
  if (confirm("This will permanently delete all saved expenses on this device. Continue?")) {
    expenses = [];
    saveExpenses();
    renderAll();
  }
});

/* ---------- Today pill ---------- */
function renderTodayPill() {
  document.getElementById("todayPill").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/* ---------- Render all ---------- */
function renderAll() {
  renderSummary();
  renderDonut();
  renderTrend();
  renderList();
}

/* ---------- Boot ---------- */
initForm();
renderTodayPill();
renderAll();
