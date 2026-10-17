"use strict";

/* =====================================================================
   Pocket Ledger (KnowUrExpense) — v2
   - Data is saved on the device first (works offline), then synced to the
     cloud if the user signs in (see sync.js).
   - Old v1 data (key pocketLedger.expenses.v1) is imported automatically
     and is never deleted.
   ===================================================================== */

/* ---------- Config ---------- */
const EXPENSE_CATS = [
  { id: "food",      label: "Food & Dining", color: "#FF6B5B" },
  { id: "groceries", label: "Groceries",     color: "#8AC926" },
  { id: "transport", label: "Transport",     color: "#3E92CC" },
  { id: "shopping",  label: "Shopping",      color: "#7048E8" },
  { id: "bills",     label: "Bills & Utils", color: "#FFB627" },
  { id: "entertain", label: "Entertainment", color: "#E85D9E" },
  { id: "health",    label: "Health",        color: "#17A673" },
  { id: "education", label: "Education",     color: "#00A6A6" },
  { id: "other",     label: "Other",         color: "#7A8194" },
];
const INCOME_CATS = [
  { id: "salary",    label: "Salary / Stipend", color: "#17A673" },
  { id: "freelance", label: "Freelance",        color: "#3E92CC" },
  { id: "gift",      label: "Gift / Allowance", color: "#E85D9E" },
  { id: "in_other",  label: "Other income",     color: "#7A8194" },
];
const METHODS = [
  { id: "upi",   label: "UPI",   color: "#7048E8" },
  { id: "cash",  label: "Cash",  color: "#17A673" },
  { id: "card",  label: "Card",  color: "#3E92CC" },
  { id: "other", label: "Other", color: "#7A8194" },
];
const KEY_V1 = "pocketLedger.expenses.v1";
const KEY_V2 = "knowurexpense.v2";
const KEY_THEME = "knowurexpense.theme";
const KEY_NOTIFIED = "knowurexpense.notified";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseYmd = (s) => { const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const thisMonthKey = () => monthKeyOf(new Date());
const prevMonthKey = () => { const n = new Date(); return monthKeyOf(new Date(n.getFullYear(), n.getMonth() - 1, 1)); };
const fmt = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmt2 = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => { const r = Math.round(n); return (r < 0 ? "−" : "") + "₹" + fmt(Math.abs(r)); };
const uid = () => Date.now() + "-" + Math.random().toString(36).slice(2, 7);
const sum = (arr) => arr.reduce((s, e) => s + e.amount, 0);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const dateLabel = (s) => parseYmd(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const FREQ_LABEL = { weekly: "Every week", monthly: "Every month", yearly: "Every year" };

/* ---------- State ---------- */
function defaultState() {
  return { v: 2, entries: [], recurring: [], budgets: { overall: 0, savingsTarget: 0, categories: {}, updatedAt: 0 } };
}
const validEntry = (e) => !!e && e.id != null && (e.type === "expense" || e.type === "income") && Number.isFinite(e.amount) && DATE_RE.test(e.date || "");
const validRule = (r) => !!r && r.id != null && Number.isFinite(r.amount) && DATE_RE.test(r.nextDue || "") && FREQ_LABEL[r.frequency] !== undefined;

function normalize(s) {
  const d = defaultState();
  s = s && typeof s === "object" ? s : {};
  d.entries = Array.isArray(s.entries) ? s.entries.filter(validEntry) : [];
  d.recurring = Array.isArray(s.recurring) ? s.recurring.filter(validRule) : [];
  if (s.budgets && typeof s.budgets === "object") {
    d.budgets = {
      overall: Number(s.budgets.overall) || 0,
      savingsTarget: Number(s.budgets.savingsTarget) || 0,
      categories: s.budgets.categories && typeof s.budgets.categories === "object" ? s.budgets.categories : {},
      updatedAt: Number(s.budgets.updatedAt) || 0,
    };
  }
  return d;
}

/* v1 entry -> v2 entry */
function legacyToEntry(e) {
  if (!e || e.id == null || !(Number(e.amount) > 0) || !DATE_RE.test(e.date || "")) return null;
  return {
    id: String(e.id), type: "expense", amount: Number(e.amount), date: e.date,
    category: e.category || "other", method: "other", note: e.note || "",
    updatedAt: parseInt(e.id, 10) || 1, deleted: false,
  };
}
/* Copies any v1 entries that v2 does not have yet. Never touches v1 itself. */
function importLegacy(s) {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(KEY_V1) || "[]"); } catch (e) { return 0; }
  if (!Array.isArray(raw)) return 0;
  const have = new Set(s.entries.map((e) => e.id));
  let n = 0;
  raw.forEach((o) => {
    const e = legacyToEntry(o);
    if (e && !have.has(e.id)) { s.entries.push(e); have.add(e.id); n++; }
  });
  return n;
}

function loadState() {
  let s = null;
  try {
    const raw = localStorage.getItem(KEY_V2);
    if (raw) s = normalize(JSON.parse(raw));
  } catch (e) {
    console.error("Could not read saved data", e);
    try { localStorage.setItem(KEY_V2 + ".corrupt", localStorage.getItem(KEY_V2)); } catch (_) {}
  }
  const fresh = !s;
  if (!s) s = defaultState();
  const added = importLegacy(s);
  if (fresh || added) { try { localStorage.setItem(KEY_V2, JSON.stringify(s)); } catch (e) {} }
  return s;
}

let state = loadState();

function saveState(silent) {
  try {
    localStorage.setItem(KEY_V2, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save", e);
    alert("Couldn't save. Your browser storage may be full or blocked.");
  }
  if (!silent && typeof bridge.onChange === "function") bridge.onChange();
}

/* ---------- Derived data ---------- */
const live = () => state.entries.filter((e) => !e.deleted);
const monthEntries = (mk, type) => live().filter((e) => e.type === type && e.date.slice(0, 7) === mk);
const catList = (type) => (type === "income" ? INCOME_CATS : EXPENSE_CATS);
const catInfo = (type, id) => { const l = catList(type); return l.find((c) => c.id === id) || l[l.length - 1]; };
const methodInfo = (id) => METHODS.find((m) => m.id === id) || METHODS[METHODS.length - 1];

function budgetStatus(mk) {
  const b = state.budgets, out = [];
  const exp = monthEntries(mk, "expense");
  if (b.overall > 0) {
    const s = sum(exp);
    out.push({ key: "overall", label: "Overall", spent: s, limit: b.overall, pct: (s / b.overall) * 100 });
  }
  EXPENSE_CATS.forEach((c) => {
    const lim = Number(b.categories[c.id]) || 0;
    if (lim > 0) {
      const s = sum(exp.filter((e) => e.category === c.id));
      out.push({ key: c.id, label: c.label, spent: s, limit: lim, pct: (s / lim) * 100 });
    }
  });
  return out;
}

/* ---------- Recurring helpers ---------- */
const liveRules = () => state.recurring.filter((r) => !r.deleted && r.active);
const dueRules = () => { const t = todayStr(); return liveRules().filter((r) => r.nextDue <= t).sort((a, b) => a.nextDue.localeCompare(b.nextDue)); };
const upcomingRules = () => {
  const t = todayStr(); const d = new Date(); d.setDate(d.getDate() + 3); const lim = ymd(d);
  return liveRules().filter((r) => r.nextDue > t && r.nextDue <= lim).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
};
const ruleName = (r) => r.note || catInfo(r.type, r.category).label;

function nextDate(dateStr, freq, anchorDay) {
  const d = parseYmd(dateStr);
  if (freq === "weekly") { d.setDate(d.getDate() + 7); return ymd(d); }
  const anchor = anchorDay || d.getDate();
  if (freq === "yearly") {
    const y = d.getFullYear() + 1, m = d.getMonth();
    return ymd(new Date(y, m, Math.min(anchor, daysIn(y, m))));
  }
  let y = d.getFullYear(), m = d.getMonth() + 1;
  if (m > 11) { m = 0; y++; }
  return ymd(new Date(y, m, Math.min(anchor, daysIn(y, m))));
}

function postRule(r, add) {
  const now = Date.now();
  if (add) {
    const id = `rec-${r.id}-${r.nextDue}`; /* same id on every device, so it can never be added twice */
    if (!state.entries.some((e) => e.id === id)) {
      state.entries.push({
        id, type: r.type, amount: r.amount, date: r.nextDue, category: r.category,
        method: r.type === "expense" ? r.method || "other" : "",
        note: r.note ? `${r.note} (recurring)` : "Recurring", updatedAt: now, deleted: false,
      });
    }
  }
  r.nextDue = nextDate(r.nextDue, r.frequency, r.anchorDay);
  r.updatedAt = now;
}

/* ---------- UI state ---------- */
let formType = "expense";
let selCat = EXPENSE_CATS[0].id;
let selMethod = "upi";
let editingId = null;
let rangeSel = "month";
let trendSel = "week";
let activeTab = "home";
let syncApi = null;
let syncState = { configured: null, user: null, status: "" };
let deferredInstall = null;

/* ---------- Toast ---------- */
function toast(msg, actionLabel, action) {
  const t = $("toast");
  t.innerHTML = "";
  const s = document.createElement("span");
  s.textContent = msg;
  t.appendChild(s);
  if (actionLabel) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = actionLabel;
    b.onclick = () => { action(); t.classList.remove("show"); };
    t.appendChild(b);
  }
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 5500);
}

/* ---------- Theme ---------- */
function themePref() { try { return localStorage.getItem(KEY_THEME) || "auto"; } catch (e) { return "auto"; } }
function resolvedDark(pref) {
  return pref === "dark" || (pref === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function applyTheme(pref) {
  try { localStorage.setItem(KEY_THEME, pref); } catch (e) {}
  const dark = resolvedDark(pref);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = $("metaTheme");
  if (meta) meta.setAttribute("content", dark ? "#13111C" : "#7048E8");
  $("themeBtn").textContent = dark ? "☀" : "☾";
  document.querySelectorAll("#themeToggle .range-btn").forEach((b) => b.classList.toggle("active", b.dataset.themePref === pref));
  Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
  if (activeTab === "insights") renderInsights();
}
if (window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => { if (themePref() === "auto") applyTheme("auto"); };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
}

/* ---------- Summary and alerts ---------- */
function renderTopbar() {
  $("todayPill").textContent = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function renderSummary() {
  const mk = thisMonthKey(), t = todayStr();
  const incE = monthEntries(mk, "income"), expE = monthEntries(mk, "expense");
  const inc = sum(incE), exp = sum(expE), sav = inc - exp;
  const todaySpent = sum(expE.filter((e) => e.date === t));
  const b = state.budgets;
  $("sumIncome").textContent = money(inc);
  $("incomeSub").textContent = `${incE.length} ${incE.length === 1 ? "entry" : "entries"}`;
  $("sumSpent").textContent = money(exp);
  $("spentSub").textContent = `Today ${money(todaySpent)}`;
  $("sumSaved").textContent = money(sav);
  if (b.savingsTarget > 0) $("savedSub").textContent = `${Math.max(0, Math.round((sav / b.savingsTarget) * 100))}% of ${money(b.savingsTarget)} goal`;
  else $("savedSub").textContent = inc > 0 ? `${Math.round((sav / inc) * 100)}% of income` : "Add income to track";
  if (b.overall > 0) { $("sumLeft").textContent = money(b.overall - exp); $("leftSub").textContent = `of ${money(b.overall)} budget`; }
  else { $("sumLeft").textContent = "—"; $("leftSub").textContent = "Set a budget"; }
}

function renderAlerts() {
  const items = [];
  budgetStatus(thisMonthKey()).forEach((s) => {
    if (s.pct >= 100) items.push({ cls: "over", icon: "🚨", tab: "budgets", text: `${s.label} budget crossed: ${money(s.spent)} of ${money(s.limit)}` });
    else if (s.pct >= 80) items.push({ cls: "warn", icon: "⚠️", tab: "budgets", text: `${s.label} budget at ${Math.floor(s.pct)}%: ${money(s.spent)} of ${money(s.limit)}` });
  });
  const due = dueRules().length;
  if (due) items.push({ cls: "info", icon: "🔔", tab: "recurring", text: `${due} recurring ${due === 1 ? "item is" : "items are"} due` });
  $("alerts").innerHTML = items.map((a) => `<button type="button" class="alert ${a.cls}" data-goto="${a.tab}"><span>${a.icon}</span><span>${esc(a.text)}</span></button>`).join("");
}

function barsHtml(items) {
  return items.map((s) => {
    const cls = s.pct >= 100 ? "over" : s.pct >= 80 ? "warn" : "";
    const sub = s.pct >= 100 ? `Over by ${money(s.spent - s.limit)}` : `${money(s.limit - s.spent)} left · ${Math.floor(s.pct)}% used`;
    return `<div class="bar-row"><div class="bar-top"><span>${esc(s.label)}</span><span class="mono">${money(s.spent)} / ${money(s.limit)}</span></div><div class="bar ${cls}"><i style="width:${Math.min(100, s.pct)}%"></i></div><div class="bar-sub">${sub}</div></div>`;
  }).join("");
}

function renderBudgetViews() {
  const st = budgetStatus(thisMonthKey());
  const empty = `<p class="empty-state">No budgets yet. Set one in the Budgets tab.</p>`;
  $("budgetBars").innerHTML = st.length ? barsHtml(st) : empty;
  const top = st.slice().sort((a, b) => b.pct - a.pct).slice(0, 3);
  $("homeBudgets").innerHTML = top.length ? barsHtml(top) : empty;
}

function renderBudgetInputs() {
  const b = state.budgets;
  $("bOverall").value = b.overall > 0 ? b.overall : "";
  $("bSavings").value = b.savingsTarget > 0 ? b.savingsTarget : "";
  $("catBudgetInputs").innerHTML = EXPENSE_CATS.map((c) =>
    `<div><label for="cb-${c.id}">${esc(c.label)}</label><input class="in" type="number" min="0" step="1" inputmode="decimal" id="cb-${c.id}" data-cat="${c.id}" placeholder="No limit" value="${Number(b.categories[c.id]) > 0 ? Number(b.categories[c.id]) : ""}"></div>`
  ).join("");
}

function saveBudgets() {
  const cats = {};
  document.querySelectorAll("#catBudgetInputs input").forEach((i) => {
    const v = parseFloat(i.value);
    if (v > 0) cats[i.dataset.cat] = v;
  });
  state.budgets = {
    overall: Math.max(0, parseFloat($("bOverall").value) || 0),
    savingsTarget: Math.max(0, parseFloat($("bSavings").value) || 0),
    categories: cats,
    updatedAt: Date.now(),
  };
  saveState();
  renderAll();
  toast("Budgets saved");
}

/* ---------- Reminders and recurring ---------- */
function reminderLine(r, isDue) {
  const when = isDue ? `due ${dateLabel(r.nextDue)}` : `on ${dateLabel(r.nextDue)}`;
  const buttons = isDue
    ? `<div class="rem-actions"><button type="button" class="btn-ghost primary" data-ract="add" data-id="${esc(r.id)}">Add</button><button type="button" class="btn-ghost" data-ract="skip" data-id="${esc(r.id)}">Skip</button></div>`
    : "";
  return `<div class="rem-row"><div class="rem-info"><div class="tx-cat">${esc(ruleName(r))}</div><div class="tx-note">${r.type === "income" ? "+" : ""}₹${fmt2(r.amount)} · ${FREQ_LABEL[r.frequency]} · ${when}</div></div>${buttons}</div>`;
}

function renderReminders() {
  const due = dueRules(), soon = upcomingRules();
  let html = "";
  if (due.length || soon.length) {
    html = `<h2 class="card-title">Reminders</h2>`;
    if (due.length) { html += `<div class="rem-group">Due now</div>` + due.map((r) => reminderLine(r, true)).join(""); }
    if (due.length > 1) html += `<button type="button" class="btn-ghost" data-ract="addall">Add all due items</button>`;
    if (soon.length) { html += `<div class="rem-group">Coming up in 3 days</div>` + soon.map((r) => reminderLine(r, false)).join(""); }
  }
  ["reminderCard", "reminderCard2"].forEach((id) => { const el = $(id); el.innerHTML = html; el.hidden = !html; });
}

function renderRules() {
  const rules = state.recurring.filter((r) => !r.deleted).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  if (!rules.length) { $("ruleList").innerHTML = `<p class="empty-state">No recurring items yet. Add rent, subscriptions or salary on the left.</p>`; return; }
  $("ruleList").innerHTML = rules.map((r) => {
    const c = catInfo(r.type, r.category);
    return `<div class="rem-row"><div class="rem-info"><div class="tx-cat">${esc(ruleName(r))} ${r.active ? "" : '<span class="badge">Paused</span>'}</div><div class="tx-note">${r.type === "income" ? "+" : ""}₹${fmt2(r.amount)} · ${esc(c.label)} · ${FREQ_LABEL[r.frequency]} · next ${dateLabel(r.nextDue)}</div></div><div class="rem-actions"><button type="button" class="btn-ghost" data-ract="toggle" data-id="${esc(r.id)}">${r.active ? "Pause" : "Resume"}</button><button type="button" class="btn-ghost" data-ract="remove" data-id="${esc(r.id)}">Delete</button></div></div>`;
  }).join("");
}

function handleRuleAction(act, id) {
  if (act === "addall") {
    let n = 0;
    state.recurring.forEach((r) => {
      let guard = 0;
      while (!r.deleted && r.active && r.nextDue <= todayStr() && guard++ < 500) { postRule(r, true); n++; }
    });
    saveState(); renderAll(); toast(`Added ${n} ${n === 1 ? "entry" : "entries"}`);
    return;
  }
  const r = state.recurring.find((x) => x.id === id);
  if (!r) return;
  if (act === "add") { postRule(r, true); saveState(); renderAll(); toast(`${ruleName(r)} added`); }
  else if (act === "skip") { postRule(r, false); saveState(); renderAll(); toast("Skipped to the next date"); }
  else if (act === "toggle") { r.active = !r.active; r.updatedAt = Date.now(); saveState(); renderAll(); }
  else if (act === "remove") {
    r.deleted = true; r.updatedAt = Date.now(); saveState(); renderAll();
    toast("Recurring item deleted", "Undo", () => { r.deleted = false; r.updatedAt = Date.now(); saveState(); renderAll(); });
  }
}

function fillRecurringSelects() {
  const type = $("rType").value;
  $("rCat").innerHTML = catList(type).map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("");
  $("rMethod").innerHTML = METHODS.filter((m) => m.id !== "other").map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join("");
  $("rMethodField").hidden = type === "income";
}

/* ---------- Add / edit form ---------- */
function renderPickers() {
  const cats = catList(formType);
  if (!cats.some((c) => c.id === selCat)) selCat = cats[0].id;
  $("categoryPicker").innerHTML = cats.map((c) =>
    `<button type="button" class="cat-chip ${c.id === selCat ? "selected" : ""}" data-cat="${c.id}" style="--dot:${c.color}"><span class="dot"></span>${esc(c.label)}</button>`
  ).join("");
  $("methodPicker").innerHTML = METHODS.map((m) =>
    `<button type="button" class="cat-chip ${m.id === selMethod ? "selected" : ""}" data-method="${m.id}" style="--dot:${m.color}"><span class="dot"></span>${esc(m.label)}</button>`
  ).join("");
  $("methodField").hidden = formType === "income";
  document.querySelectorAll("#typeToggle .range-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === formType));
  $("submitBtn").innerHTML = `<span class="btn-add-icon">${editingId ? "✓" : "+"}</span> ${editingId ? "Save changes" : formType === "income" ? "Add income" : "Add expense"}`;
  $("formTitle").textContent = editingId ? "Edit entry" : "Add an entry";
  $("cancelEdit").hidden = !editingId;
}

function resetForm() {
  editingId = null;
  $("amount").value = "";
  $("note").value = "";
  $("date").value = todayStr();
  renderPickers();
}

function startEdit(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  formType = e.type;
  selCat = e.category;
  selMethod = e.method || "other";
  $("amount").value = e.amount;
  $("date").value = e.date;
  $("note").value = e.note || "";
  showTab("home");
  renderPickers();
  $("expenseForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function crossingAlerts(entry) {
  /* Called right after a NEW expense is added: warn if it pushed a budget over 80% or 100%. */
  const mk = entry.date.slice(0, 7);
  const after = budgetStatus(mk);
  const msgs = [];
  after.forEach((s) => {
    if (s.key !== "overall" && s.key !== entry.category) return;
    const beforePct = ((s.spent - entry.amount) / s.limit) * 100;
    if (s.pct >= 100 && beforePct < 100) msgs.push(`${s.label} budget crossed`);
    else if (s.pct >= 80 && beforePct < 80) msgs.push(`${s.label} budget at ${Math.floor(s.pct)}%`);
  });
  return msgs;
}

function onSubmitEntry(ev) {
  ev.preventDefault();
  const amount = parseFloat($("amount").value);
  if (!(amount > 0)) { toast("Enter an amount greater than 0"); return; }
  const date = DATE_RE.test($("date").value) ? $("date").value : todayStr();
  const note = $("note").value.trim();
  const now = Date.now();
  const method = formType === "expense" ? selMethod : "";
  let entry, isNew = false;
  if (editingId) {
    entry = state.entries.find((x) => x.id === editingId);
    if (entry) Object.assign(entry, { type: formType, amount, date, category: selCat, method, note, updatedAt: now });
  }
  if (!entry) {
    isNew = true;
    entry = { id: uid(), type: formType, amount, date, category: selCat, method, note, updatedAt: now, deleted: false };
    state.entries.push(entry);
  }
  const wasEdit = !!editingId;
  saveState();
  resetForm();
  renderAll();
  if (wasEdit) toast("Changes saved");
  else {
    const warn = entry.type === "expense" && isNew ? crossingAlerts(entry) : [];
    toast(warn.length ? `Added. Heads up: ${warn.join(", ")}` : entry.type === "income" ? "Income added" : "Expense added");
  }
}

/* ---------- Lists ---------- */
function rowHtml(e) {
  const c = catInfo(e.type, e.category);
  const badge = e.type === "expense" && e.method ? ` <span class="badge">${esc(methodInfo(e.method).label)}</span>` : "";
  return `<div class="tx-row" data-id="${esc(e.id)}">
    <div class="tx-dot" style="background:${c.color}">${esc(c.label.charAt(0))}</div>
    <div class="tx-info"><div class="tx-cat">${esc(c.label)}${badge}</div>${e.note ? `<div class="tx-note">${esc(e.note)}</div>` : ""}<div class="tx-note tx-date-m">${dateLabel(e.date)}</div></div>
    <div class="tx-date">${dateLabel(e.date)}</div>
    <div class="tx-right"><span class="tx-amount ${e.type}">${e.type === "income" ? "+" : ""}₹${fmt2(e.amount)}</span><button type="button" class="tx-btn" data-act="edit" data-id="${esc(e.id)}" aria-label="Edit entry" title="Edit">✎</button><button type="button" class="tx-btn del" data-act="del" data-id="${esc(e.id)}" aria-label="Delete entry" title="Delete">✕</button></div>
  </div>`;
}
const sortEntries = (arr) => arr.slice().sort((a, b) => (b.date + String(b.updatedAt)).localeCompare(a.date + String(a.updatedAt)));

function renderRecent() {
  const data = sortEntries(live()).slice(0, 5);
  $("recentList").innerHTML = data.map(rowHtml).join("");
  $("recentEmpty").hidden = data.length > 0;
}

function renderHistory() {
  const all = live();
  /* month filter options */
  const months = Array.from(new Set(all.map((e) => e.date.slice(0, 7)))).sort().reverse();
  const curM = $("fMonth").value || "all";
  $("fMonth").innerHTML = `<option value="all">All months</option>` + months.map((m) => {
    const lab = parseYmd(m + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return `<option value="${m}">${lab}</option>`;
  }).join("");
  $("fMonth").value = months.includes(curM) ? curM : "all";
  const curP = $("fMethod").value || "all";
  $("fMethod").innerHTML = `<option value="all">All payment methods</option>` + METHODS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
  $("fMethod").value = curP;

  const q = $("searchBox").value.trim().toLowerCase();
  const type = $("fType").value, method = $("fMethod").value, month = $("fMonth").value;
  let data = all.filter((e) =>
    (type === "all" || e.type === type) &&
    (method === "all" || e.method === method) &&
    (month === "all" || e.date.slice(0, 7) === month) &&
    (!q || (e.note || "").toLowerCase().includes(q) || catInfo(e.type, e.category).label.toLowerCase().includes(q))
  );
  data = sortEntries(data);
  const inc = sum(data.filter((e) => e.type === "income")), exp = sum(data.filter((e) => e.type === "expense"));
  $("histSummary").textContent = data.length ? `${data.length} ${data.length === 1 ? "entry" : "entries"} · Income ${money(inc)} · Spent ${money(exp)}${data.length > 300 ? " · showing latest 300" : ""}` : "";
  $("txList").innerHTML = data.slice(0, 300).map(rowHtml).join("");
  const empty = $("emptyState");
  empty.hidden = data.length > 0;
  empty.textContent = all.length === 0 ? "No entries yet. Add your first one on the Home tab." : "No entries match these filters.";
}

function deleteEntry(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  e.deleted = true; e.updatedAt = Date.now();
  if (editingId === id) resetForm();
  saveState(); renderAll();
  toast("Entry deleted", "Undo", () => { e.deleted = false; e.updatedAt = Date.now(); saveState(); renderAll(); });
}

/* ---------- Charts ---------- */
const charts = {};
function upsertChart(key, canvasId, config) {
  if (typeof Chart === "undefined") return;
  if (charts[key]) { charts[key].data = config.data; charts[key].update(); return; }
  charts[key] = new Chart($(canvasId), config);
}
function axisColors() { return { tick: cssVar("--ink-soft"), grid: cssVar("--line") }; }

function renderDonut(key, canvasId, centerId, legendId, groups) {
  const active = groups.filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
  const total = active.reduce((s, g) => s + g.value, 0);
  $(centerId).querySelector(".donut-total").textContent = money(total);
  upsertChart(key, canvasId, {
    type: "doughnut",
    data: { labels: active.map((g) => g.label), datasets: [{ data: active.map((g) => g.value), backgroundColor: active.map((g) => g.color), borderWidth: 3, borderColor: cssVar("--paper"), hoverOffset: 6 }] },
    options: { cutout: "68%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ₹${fmt(c.raw)}` } } }, animation: { duration: 400 } },
  });
  $(legendId).innerHTML = active.length
    ? active.map((g) => `<span class="legend-item"><span class="dot" style="background:${g.color}"></span>${esc(g.label)} · ₹${fmt(g.value)}</span>`).join("")
    : `<span class="legend-item">No spending in this range yet</span>`;
}

function rangeExpenses() {
  const mk = thisMonthKey(), yr = todayStr().slice(0, 4);
  return live().filter((e) => e.type === "expense" && (rangeSel === "month" ? e.date.slice(0, 7) === mk : rangeSel === "year" ? e.date.slice(0, 4) === yr : true));
}

function renderInsights() {
  const ac = axisColors();
  const narrow = window.innerWidth < 600;

  /* 1. income vs spending, last 6 months */
  const now = new Date(), labels = [], inc = [], exp = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1), k = monthKeyOf(d);
    labels.push(d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }));
    inc.push(sum(monthEntries(k, "income")));
    exp.push(sum(monthEntries(k, "expense")));
  }
  upsertChart("monthly", "monthlyChart", {
    type: "bar",
    data: { labels, datasets: [{ label: "Income", data: inc, backgroundColor: "#17A673", borderRadius: 6 }, { label: "Spent", data: exp, backgroundColor: "#FF6B5B", borderRadius: 6 }] },
    options: {
      aspectRatio: narrow ? 1.25 : 2.6,
      plugins: { legend: { display: true, labels: { color: ac.tick } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ₹${fmt(c.raw)}` } } },
      scales: { y: { beginAtZero: true, ticks: { color: ac.tick, callback: (v) => "₹" + fmt(v) }, grid: { color: ac.grid } }, x: { ticks: { color: ac.tick }, grid: { display: false } } },
      animation: { duration: 400 },
    },
  });

  /* 2 + 3. category and payment donuts */
  const data = rangeExpenses();
  renderDonut("cat", "categoryChart", "catCenter", "catLegend",
    EXPENSE_CATS.map((c) => ({ label: c.label, color: c.color, value: sum(data.filter((e) => e.category === c.id)) })));
  renderDonut("pay", "payChart", "payCenter", "payLegend",
    METHODS.map((m) => ({ label: m.label, color: m.color, value: sum(data.filter((e) => (e.method || "other") === m.id)) })));

  /* 4. trend */
  const tl = [], tv = [], all = live().filter((e) => e.type === "expense");
  if (trendSel === "week" || trendSel === "month") {
    const days = trendSel === "week" ? 7 : 30;
    const byDay = {};
    all.forEach((e) => { byDay[e.date] = (byDay[e.date] || 0) + e.amount; });
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      tl.push(d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }));
      tv.push(byDay[ymd(d)] || 0);
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      tl.push(d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }));
      tv.push(sum(monthEntries(monthKeyOf(d), "expense")));
    }
  }
  upsertChart("trend", "trendChart", {
    type: "line",
    data: { labels: tl, datasets: [{ data: tv, borderColor: "#7048E8", backgroundColor: "rgba(112,72,232,0.18)", fill: true, tension: 0.35, pointRadius: tv.length > 20 ? 0 : 3, pointBackgroundColor: "#7048E8", borderWidth: 2.5 }] },
    options: {
      aspectRatio: narrow ? 1.4 : 3,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ₹${fmt(c.raw)}` } } },
      scales: { y: { beginAtZero: true, ticks: { color: ac.tick, callback: (v) => "₹" + fmt(v) }, grid: { color: ac.grid } }, x: { ticks: { color: ac.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } } },
      animation: { duration: 400 },
    },
  });

  renderInsightText();
}

function renderInsightText() {
  const mk = thisMonthKey(), now = new Date();
  const expE = monthEntries(mk, "expense"), incE = monthEntries(mk, "income"), prevE = monthEntries(prevMonthKey(), "expense");
  const se = sum(expE), sp = sum(prevE), si = sum(incE), day = now.getDate(), dim = daysIn(now.getFullYear(), now.getMonth());
  const lines = [];
  if (!expE.length && !incE.length) { $("insightList").innerHTML = `<li>Add a few entries and your insights will show up here.</li>`; return; }
  if (se > 0) lines.push(`You spend about ${money(se / day)} a day this month. At this pace the month ends near ${money((se / day) * dim)}.`);
  if (state.budgets.overall > 0 && se > 0 && (se / day) * dim > state.budgets.overall) lines.push(`That pace is above your ${money(state.budgets.overall)} budget. Try to cut ${money((se / day) * dim - state.budgets.overall)} over the rest of the month.`);
  if (sp > 0) lines.push(`So far you have spent ${money(se)}. All of last month was ${money(sp)}.`);
  if (se > 0) {
    const by = {};
    expE.forEach((e) => { by[e.category] = (by[e.category] || 0) + e.amount; });
    const top = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
    lines.push(`Biggest category: ${catInfo("expense", top).label} at ${money(by[top])} (${Math.round((by[top] / se) * 100)}% of spending).`);
    const big = expE.slice().sort((a, b) => b.amount - a.amount)[0];
    lines.push(`Largest single expense: ${money(big.amount)} on ${catInfo("expense", big.category).label}${big.note ? " (" + esc(big.note) + ")" : ""}, ${dateLabel(big.date)}.`);
    const pm = {};
    expE.forEach((e) => { const k = e.method || "other"; pm[k] = (pm[k] || 0) + e.amount; });
    const tp = Object.keys(pm).sort((a, b) => pm[b] - pm[a])[0];
    lines.push(`Most of your money went out through ${methodInfo(tp).label} (${money(pm[tp])}).`);
  }
  if (si > 0) lines.push(`Income ${money(si)}, spending ${money(se)}: you have saved ${money(si - se)} (${Math.round(((si - se) / si) * 100)}% of income).`);
  $("insightList").innerHTML = lines.map((l) => `<li>${l}</li>`).join("");
}

/* ---------- Tabs ---------- */
function showTab(name) {
  activeTab = name;
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  window.scrollTo(0, 0);
  if (name === "insights") renderInsights();
  if (name === "budgets") renderBudgetInputs();
  if (name === "settings") renderAccount();
}

/* ---------- Render all ---------- */
function renderAll() {
  renderSummary();
  renderAlerts();
  renderBudgetViews();
  renderReminders();
  renderRules();
  renderRecent();
  renderHistory();
  if (activeTab === "insights") renderInsights();
}

/* ---------- Settings: account / sync ---------- */
function setSyncState(patch) {
  syncState = Object.assign({}, syncState, patch);
  const b = $("syncBadge");
  if (syncState.configured === false) { b.textContent = "Local only"; b.className = "sync-badge"; }
  else if (syncState.configured === null) { b.textContent = "Checking…"; b.className = "sync-badge"; }
  else if (!syncState.user) { b.textContent = "Sign in to sync"; b.className = "sync-badge"; }
  else {
    const bad = /couldn|error|offline|retry/i.test(syncState.status || "");
    b.textContent = "☁ " + (syncState.status || "Connected");
    b.className = "sync-badge " + (bad ? "bad" : "ok");
  }
  renderAccount();
}

function renderAccount() {
  const s = syncState;
  const msg = $("syncMsg");
  $("authForm").hidden = true;
  $("authedBox").hidden = true;
  if (s.configured === null) msg.textContent = "Checking sync…";
  else if (s.configured === false) msg.textContent = "Cloud sync is not set up yet, so your data is saved on this device only. Add your Firebase keys in firebase-config.js to turn it on.";
  else if (!s.user) { msg.textContent = "Sign in to keep your phone and laptop in sync. Your data stays on this device either way."; $("authForm").hidden = false; }
  else { msg.textContent = ""; $("authedBox").hidden = false; $("authedEmail").textContent = s.user.email || "Signed in"; $("authedStatus").textContent = s.status || ""; }
}

function authMsg(e) {
  const m = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/wrong-password": "Wrong email or password.",
    "auth/user-not-found": "No account with that email. Tap Create account.",
    "auth/email-already-in-use": "That email already has an account. Tap Sign in.",
    "auth/weak-password": "Password needs at least 6 characters.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/network-request-failed": "No internet connection. Try again when you're online.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/operation-not-allowed": "Email sign-in is not turned on in Firebase yet (see the guide, step 2).",
  };
  return m[e && e.code] || "Something went wrong: " + ((e && (e.code || e.message)) || "unknown error");
}

async function doAuth(kind) {
  if (!syncApi) { toast("Sync isn't ready yet. Check your internet and try again."); return; }
  const email = $("authEmail").value.trim(), pw = $("authPass").value;
  if (kind === "reset") {
    if (!email) { toast("Type your email first"); return; }
    try { await syncApi.reset(email); toast("Password reset email sent"); } catch (e) { toast(authMsg(e)); }
    return;
  }
  if (!email || !pw) { toast("Enter your email and password"); return; }
  try {
    if (kind === "in") await syncApi.signIn(email, pw); else await syncApi.signUp(email, pw);
    $("authPass").value = "";
    toast(kind === "in" ? "Signed in" : "Account created");
  } catch (e) { toast(authMsg(e)); }
}

/* ---------- Backup / restore / export / delete ---------- */
function download(filename, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function mergeList(local, remote) {
  const idx = new Map(local.map((x, i) => [String(x.id), i]));
  let changed = false;
  remote.forEach((r) => {
    const k = String(r.id), i = idx.get(k);
    if (i === undefined) { local.push(r); idx.set(k, local.length - 1); changed = true; }
    else if ((r.updatedAt || 0) > (local[i].updatedAt || 0)) { local[i] = r; changed = true; }
  });
  return changed;
}
function mergePayload(p) {
  let changed = false;
  if (p && Array.isArray(p.entries)) changed = mergeList(state.entries, p.entries.filter(validEntry)) || changed;
  if (p && Array.isArray(p.recurring)) changed = mergeList(state.recurring, p.recurring.filter(validRule)) || changed;
  if (p && p.budgets && (Number(p.budgets.updatedAt) || 0) > (state.budgets.updatedAt || 0)) {
    state.budgets = normalize({ budgets: p.budgets }).budgets;
    changed = true;
  }
  return changed;
}

function backupJson() {
  download(`pocket-ledger-backup-${todayStr()}.json`, JSON.stringify(state), "application/json");
  toast("Backup downloaded");
}

/* Restore: adds records that are missing, and brings back ones that were deleted here.
   Records that already exist and are not deleted are left exactly as they are. */
function restoreList(local, backup, valid) {
  const idx = new Map(local.map((x, i) => [String(x.id), i]));
  const now = Date.now();
  let n = 0;
  backup.filter(valid).forEach((r) => {
    if (r.deleted) return;
    const i = idx.get(String(r.id));
    if (i === undefined) { local.push(r); idx.set(String(r.id), local.length - 1); n++; }
    else if (local[i].deleted) { local[i] = Object.assign({}, r, { deleted: false, updatedAt: now }); n++; }
  });
  return n;
}

async function restoreFromFile(file) {
  try {
    const data = JSON.parse(await file.text());
    let p;
    if (Array.isArray(data)) p = { entries: data.map(legacyToEntry).filter(Boolean), recurring: [], budgets: null };   /* old v1 backup */
    else if (data && Array.isArray(data.entries)) p = normalize(data);
    else throw new Error("not a backup file");
    const n = restoreList(state.entries, p.entries, validEntry);
    restoreList(state.recurring, p.recurring || [], validRule);
    const b = state.budgets;
    const noBudgets = !(b.overall > 0) && !(b.savingsTarget > 0) && !Object.keys(b.categories || {}).length;
    if (noBudgets && p.budgets && (p.budgets.overall > 0 || p.budgets.savingsTarget > 0 || Object.keys(p.budgets.categories || {}).length)) {
      state.budgets = Object.assign({}, p.budgets, { updatedAt: Date.now() });
    }
    saveState(); renderAll(); renderBudgetInputs();
    toast(`Restored ${n} ${n === 1 ? "entry" : "entries"}.`);
  } catch (e) {
    console.error(e);
    toast("That file isn't a valid backup.");
  }
}

function exportCsv() {
  const data = live();
  if (!data.length) { toast("Nothing to export yet"); return; }
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const rows = [["Date", "Type", "Category", "Payment method", "Amount", "Note"].map(q).join(",")];
  data.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
    rows.push([e.date, e.type, catInfo(e.type, e.category).label, e.type === "expense" ? methodInfo(e.method).label : "", e.amount, e.note || ""].map(q).join(","));
  });
  download(`pocket-ledger-${todayStr()}.csv`, "\ufeff" + rows.join("\n"), "text/csv;charset=utf-8");
}

function deleteAll() {
  if (!live().length && !state.recurring.some((r) => !r.deleted)) { toast("Nothing to delete"); return; }
  if (!confirm("Delete ALL entries, recurring items and budgets? If you are signed in, this also removes them from your other devices. Download a backup first if unsure.")) return;
  const now = Date.now();
  state.entries.forEach((e) => { if (!e.deleted) { e.deleted = true; e.updatedAt = now; } });
  state.recurring.forEach((r) => { if (!r.deleted) { r.deleted = true; r.updatedAt = now; } });
  state.budgets = { overall: 0, savingsTarget: 0, categories: {}, updatedAt: now };
  saveState(); renderAll(); renderBudgetInputs();
  toast("All data deleted");
}

/* ---------- Notifications ---------- */
function updateNotifyBtn() {
  const b = $("notifyBtn");
  if (!("Notification" in window)) { b.textContent = "Notifications not supported here"; b.disabled = true; return; }
  b.textContent = Notification.permission === "granted" ? "Reminder notifications are on" : "Turn on reminder notifications";
}
function maybeNotifyDue() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const due = dueRules().length, soon = upcomingRules().length;
  if (!due && !soon) return;
  try { if (localStorage.getItem(KEY_NOTIFIED) === todayStr()) return; localStorage.setItem(KEY_NOTIFIED, todayStr()); } catch (e) {}
  const body = [due ? `${due} due now` : "", soon ? `${soon} coming up in 3 days` : ""].filter(Boolean).join(" · ");
  const title = "KnowUrExpense reminder";
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, icon: "icons/icon-192.png" }))
      .catch(() => { try { new Notification(title, { body }); } catch (e) {} });
  } else { try { new Notification(title, { body }); } catch (e) {} }
}

/* ---------- Sync bridge (used by sync.js) ---------- */
const bridge = {
  onChange: null,                    /* sync.js sets this; called after every local change */
  setSyncState,
  getState: () => state,
  splitShards() {
    const months = {};
    state.entries.forEach((e) => { const k = e.date.slice(0, 7); (months[k] = months[k] || []).push(e); });
    const out = {};
    Object.keys(months).forEach((k) => { out[k] = { entries: months[k] }; });
    out.meta = { recurring: state.recurring, budgets: state.budgets };
    return out;
  },
  mergeShard: (payload) => mergePayload(payload),
  finishRemote() { saveState(true); renderAll(); },
};
window.LedgerBridge = bridge;

/* ---------- Event wiring ---------- */
function wire() {
  $("expenseForm").addEventListener("submit", onSubmitEntry);
  $("cancelEdit").addEventListener("click", resetForm);
  $("typeToggle").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]"); if (!b) return;
    formType = b.dataset.type; renderPickers();
  });
  $("categoryPicker").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; selCat = b.dataset.cat; renderPickers(); });
  $("methodPicker").addEventListener("click", (e) => { const b = e.target.closest("[data-method]"); if (!b) return; selMethod = b.dataset.method; renderPickers(); });

  document.body.addEventListener("click", (e) => {
    const nav = e.target.closest(".nav-btn"); if (nav) { showTab(nav.dataset.tab); return; }
    const go = e.target.closest("[data-goto]"); if (go) { showTab(go.dataset.goto); return; }
    const act = e.target.closest("[data-act]"); if (act) { act.dataset.act === "edit" ? startEdit(act.dataset.id) : deleteEntry(act.dataset.id); return; }
    const ra = e.target.closest("[data-ract]"); if (ra) { handleRuleAction(ra.dataset.ract, ra.dataset.id); return; }
  });

  $("saveBudgets").addEventListener("click", saveBudgets);

  $("rType").addEventListener("change", fillRecurringSelects);
  $("recurringForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseFloat($("rAmount").value);
    if (!(amount > 0)) { toast("Enter an amount greater than 0"); return; }
    const start = DATE_RE.test($("rStart").value) ? $("rStart").value : todayStr();
    const type = $("rType").value;
    state.recurring.push({
      id: uid(), type, amount, category: $("rCat").value, method: type === "expense" ? $("rMethod").value : "",
      note: $("rNote").value.trim(), frequency: $("rFreq").value, anchorDay: parseYmd(start).getDate(),
      nextDue: start, active: true, updatedAt: Date.now(), deleted: false,
    });
    saveState();
    $("rAmount").value = ""; $("rNote").value = ""; $("rStart").value = todayStr();
    renderAll();
    toast("Recurring item added");
  });

  $("rangeToggle").addEventListener("click", (e) => {
    const b = e.target.closest(".range-btn"); if (!b) return;
    rangeSel = b.dataset.range;
    document.querySelectorAll("#rangeToggle .range-btn").forEach((x) => x.classList.toggle("active", x === b));
    renderInsights();
  });
  $("trendToggle").addEventListener("click", (e) => {
    const b = e.target.closest(".range-btn"); if (!b) return;
    trendSel = b.dataset.range;
    document.querySelectorAll("#trendToggle .range-btn").forEach((x) => x.classList.toggle("active", x === b));
    renderInsights();
  });

  ["searchBox", "fType", "fMethod", "fMonth"].forEach((id) => $(id).addEventListener("input", renderHistory));

  $("themeBtn").addEventListener("click", () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));
  $("themeToggle").addEventListener("click", (e) => { const b = e.target.closest("[data-theme-pref]"); if (b) applyTheme(b.dataset.themePref); });

  $("backupBtn").addEventListener("click", backupJson);
  $("restoreBtn").addEventListener("click", () => $("restoreFile").click());
  $("restoreFile").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) restoreFromFile(f); e.target.value = ""; });
  $("exportBtn").addEventListener("click", exportCsv);
  $("resetBtn").addEventListener("click", deleteAll);

  $("signInBtn").addEventListener("click", () => doAuth("in"));
  $("signUpBtn").addEventListener("click", () => doAuth("up"));
  $("forgotBtn").addEventListener("click", () => doAuth("reset"));
  $("signOutBtn").addEventListener("click", async () => { if (syncApi) { await syncApi.signOut(); toast("Signed out. Your data stays on this device."); } });
  $("syncNowBtn").addEventListener("click", () => { if (syncApi) { syncApi.syncNow(); toast("Syncing…"); } });
  $("syncBadge").addEventListener("click", () => showTab("settings"));

  $("notifyBtn").addEventListener("click", () => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then((p) => { updateNotifyBtn(); toast(p === "granted" ? "Reminder notifications are on" : "Permission was not given"); });
  });

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; $("installBtn").hidden = false; });
  window.addEventListener("appinstalled", () => { deferredInstall = null; $("installBtn").hidden = true; });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) {}
    deferredInstall = null; $("installBtn").hidden = true;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    renderTopbar();
    if (!$("amount").value && !editingId) $("date").value = todayStr();
    renderAll();
  });
}

/* ---------- Boot ---------- */
function boot() {
  wire();
  renderTopbar();
  $("date").value = todayStr();
  $("rStart").value = todayStr();
  fillRecurringSelects();
  renderPickers();
  renderBudgetInputs();
  applyTheme(themePref());
  renderAll();
  updateNotifyBtn();
  renderAccount();
  maybeNotifyDue();

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker not registered", e));
  }

  /* Cloud sync is optional and loaded last, so the app works even if it fails (e.g. offline). */
  try {
    import("./sync.js")
      .then((m) => m.initSync(bridge))
      .then((api) => { syncApi = api; if (!api) setSyncState({ configured: false }); })
      .catch((e) => { console.warn("Sync unavailable", e); setSyncState({ configured: true, user: null, status: "Sync unavailable right now" }); });
  } catch (e) {
    setSyncState({ configured: false });
  }
}
boot();
