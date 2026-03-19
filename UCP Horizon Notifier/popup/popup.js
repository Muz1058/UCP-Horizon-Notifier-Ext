// popup/popup.js ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â v16
// Unread/read tracking: shows unread count on summary cards,
// defaults to "Unread Only" view, marks items read on interaction.

"use strict";

let state = {
  announcements: [], outlines: [], materials: [], submissions: [], grades: [],
  lastScanned: null,
  readIds: {},   // { [id]: true }
};
let activeFilter  = "all";
let showAllMode   = false;   // false = unread only, true = show all
const expandedIds = new Set();

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  attachListeners();
});

function attachListeners() {
  document.getElementById("scanBtn").addEventListener("click", onScanClick);
  document.getElementById("clearBtn").addEventListener("click", onClearClick);
  document.getElementById("scanAllBtn").addEventListener("click", onScanAllClick);

  document.querySelectorAll(".card[data-filter]").forEach(card =>
    card.addEventListener("click", () => setFilter(card.dataset.filter)));
  document.querySelectorAll(".pill[data-filter]").forEach(pill =>
    pill.addEventListener("click", () => setFilter(pill.dataset.filter)));

  document.getElementById("toggleReadBtn").addEventListener("click", () => {
    showAllMode = !showAllMode;
    updateToggleBtn();
    renderList(activeFilter);
  });

  document.getElementById("markAllReadBtn").addEventListener("click", onMarkAllRead);

  // Live-sync: when read state or data changes in any tab, refresh popup counts
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const relevant = changes.hz_read_ids || changes.hz_announcements || changes.hz_outlines ||
                     changes.hz_materials || changes.hz_submissions || changes.hz_grades;
    if (!relevant) return;
    chrome.runtime.sendMessage({ action: "GET_UPDATES" }, (res) => {
      if (res && res.data) {
        state = { ...state, ...res.data };
        render();
      }
    });
  });

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Settings panel ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  // Toggle open/close
  document.getElementById("settingsToggle").addEventListener("click", () => {
    const panel = document.getElementById("settingsPanel");
    const arrow = document.getElementById("settingsArrow");
    const isOpen = panel.classList.toggle("open");
    arrow.textContent = isOpen ? "ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â´" : "ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¾";
  });

  // Load saved setting (default: true = enabled)
  chrome.storage.local.get("hz_auto_scan_on_login", res => {
    const enabled = res.hz_auto_scan_on_login !== false; // default true
    document.getElementById("autoScanToggle").checked = enabled;
  });

  // Save on change
  document.getElementById("autoScanToggle").addEventListener("change", e => {
    chrome.storage.local.set({ hz_auto_scan_on_login: e.target.checked });
  });
}

function loadData() {
  chrome.runtime.sendMessage({ action: "GET_UPDATES" }, (res) => {
    if (res && res.data) state = { ...state, ...res.data };
    checkDashboardContext();
    render();
  });
}

function checkDashboardContext() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    const url = tabs[0].url || "";
    const scanAllBtn = document.getElementById("scanAllBtn");
    if (!scanAllBtn) return;
    const onHorizon = url.includes("horizon.ucp.edu.pk");
    scanAllBtn.style.display = onHorizon ? "inline-flex" : "none";
  });
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Unread counting ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
function countUnread(arr) {
  return arr.filter(item => !state.readIds[item.id]).length;
}

function render() {
  const unreadAnn = countUnread(state.announcements || []);
  const unreadOut = countUnread(state.outlines      || []);
  const unreadMat = countUnread(state.materials     || []);
  const unreadSub = countUnread(state.submissions   || []);
  const unreadGrd = countUnread(state.grades        || []);

  // Cards show UNREAD count (badge shows total if more exist)
  setCardCount("cnt-ann", unreadAnn, (state.announcements||[]).length);
  setCardCount("cnt-out", unreadOut, (state.outlines     ||[]).length);
  setCardCount("cnt-mat", unreadMat, (state.materials    ||[]).length);
  setCardCount("cnt-sub", unreadSub, (state.submissions  ||[]).length);
  setCardCount("cnt-grd", unreadGrd, (state.grades       ||[]).length);

  const footer = document.getElementById("footer");
  if (state.lastScanned) {
    const d = new Date(state.lastScanned);
    footer.textContent = `Last scan: ${d.toLocaleDateString()} at ${d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
  } else {
    footer.textContent = "Last scan: ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
  }

  updateToggleBtn();

  chrome.storage.local.get("hz_scan_all_progress", (res) => {
    const prog = res.hz_scan_all_progress;
    if (prog && prog.running) updateScanAllProgress(prog);
    else if (prog && prog.summary) showScanAllSummary(prog.summary);
    else renderList(activeFilter);
  });
}

function setCardCount(elemId, unread, total) {
  const el = document.getElementById(elemId);
  if (!el) return;
  el.textContent = unread;
  // Dim the card if nothing unread
  const card = el.closest(".card");
  if (card) card.classList.toggle("all-read", unread === 0 && total > 0);
}

function updateToggleBtn() {
  const btn = document.getElementById("toggleReadBtn");
  if (!btn) return;
  btn.textContent = showAllMode ? "ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Âµ Unread Only" : "ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¹ Show All";
  btn.title = showAllMode ? "Switch to unread-only view" : "Show all items including read";
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ List rendering ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
function renderList(filter) {
  const container = document.getElementById("list");
  let rows = [];
  if (filter === "all" || filter === "ann") (state.announcements||[]).forEach(d => rows.push({type:"ann",data:d}));
  if (filter === "all" || filter === "out") (state.outlines     ||[]).forEach(d => rows.push({type:"out",data:d}));
  if (filter === "all" || filter === "mat") (state.materials    ||[]).forEach(d => rows.push({type:"mat",data:d}));
  if (filter === "all" || filter === "sub") (state.submissions  ||[]).forEach(d => rows.push({type:"sub",data:d}));
  if (filter === "all" || filter === "grd") (state.grades       ||[]).forEach(d => rows.push({type:"grd",data:d}));

  // Sort: newest first (most recent scannedAt at top)
  // Within same timestamp, unread shown before read
  rows.sort((a, b) => {
    const dateDiff = new Date(b.data.scannedAt||0) - new Date(a.data.scannedAt||0);
    if (dateDiff !== 0) return dateDiff;
    const aRead = !!state.readIds[a.data.id];
    const bRead = !!state.readIds[b.data.id];
    return aRead === bRead ? 0 : aRead ? 1 : -1;
  });

  // Filter to unread only unless showAllMode
  const visible = showAllMode ? rows : rows.filter(r => !state.readIds[r.data.id]);

  if (!visible.length) {
    const isAllRead = rows.length > 0 && !showAllMode;
    const icons = {all:"ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦",ann:"ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â¢",mat:"ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â",sub:"ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â",grd:"ÃƒÂ°Ã…Â¸Ã…Â½Ã¢â‚¬Å“"};
    container.innerHTML = `<div class="empty">
      <div class="empty-icon">${isAllRead ? "ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦" : icons[filter]||"ÃƒÂ¢Ã…â€œÃ‚Â¨"}</div>
      <div class="empty-text">${isAllRead ? "All caught up!" : "No updates detected yet"}</div>
      <div class="empty-sub">${isAllRead
        ? `All ${rows.length} item${rows.length!==1?"s":""} marked as read. <a href="#" id="showAllLink" style="color:var(--teal)">Show all</a>`
        : "Open any course on Horizon, then click Scan Now"}</div>
    </div>`;
    document.getElementById("showAllLink")?.addEventListener("click", e => {
      e.preventDefault();
      showAllMode = true;
      updateToggleBtn();
      renderList(filter);
    });
    return;
  }

  container.innerHTML = visible.map(r => itemHTML(r)).join("");

  // Attach view-detail expand for announcements (marks read)
  container.querySelectorAll(".ann-view-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id     = btn.dataset.id;
      const rawId  = btn.dataset.rawid;
      const descBox = document.getElementById(`desc-${id}`);
      if (!descBox) return;
      const expanded = expandedIds.has(id);
      if (expanded) {
        expandedIds.delete(id);
        descBox.style.display = "none";
        btn.textContent = "View Details";
        btn.classList.remove("active");
      } else {
        expandedIds.add(id);
        descBox.style.display = "block";
        btn.textContent = "Hide";
        btn.classList.add("active");
        // Mark as read when user opens the description
        if (rawId) doMarkRead(rawId);
      }
    });
  });

  // Mark non-announcement items as read when popup is open (they're visible)
  const visibleNonAnn = visible.filter(r => r.type !== "ann" && !state.readIds[r.data.id]);
  if (visibleNonAnn.length) {
    // Small delay so user has actually seen the popup
    setTimeout(() => {
      const ids = visibleNonAnn.map(r => r.data.id);
      doMarkReadBulk(ids);
    }, 1500);
  }
}

function itemHTML({ type, data }) {
  const isRead     = !!state.readIds[data.id];
  const tabLabel   = data.tabLabel || typeToLabel(type);
  const course     = data.courseName || "";
  const headerLine = course
    ? `${esc(tabLabel)} <span style="color:var(--muted);font-weight:400">(${esc(course)})</span>`
    : esc(tabLabel);

  let title = "", meta = "", extraHTML = "";

  if (type === "ann") {
    title = esc(data.subject || "");
    meta  = data.date ? `ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¦ ${esc(data.date)}` : "";

    const desc      = (data.description || "").trim();
    const hasDesc   = desc.length > 0;
    const hasAttach = !!data.attachmentLink;
    const itemId    = esc(data.id || "");
    const isExpanded = expandedIds.has(data.id);

    if (hasDesc || hasAttach) {
      let descContent = "";
      if (hasDesc)    descContent += `<div class="ann-desc-text">${esc(desc)}</div>`;
      const safeAttachmentLink = safePortalUrl(data.attachmentLink);
      if (safeAttachmentLink)  descContent += `<a class="ann-attach-link" href="${esc(safeAttachmentLink)}" target="_blank" rel="noopener noreferrer">View Attachment</a>`;
      extraHTML = `
        <div class="ann-actions">
          <button class="ann-view-btn${isExpanded?" active":""}" data-id="${itemId}" data-rawid="${itemId}">
            ${isExpanded ? "Hide" : "View Details"}
          </button>
        </div>
        <div class="ann-desc-box" id="desc-${itemId}" style="display:${isExpanded?"block":"none"}">
          ${descContent}
        </div>`;
    }

  } else if (type === "out") {
    title = esc(data.title || data.fileName || "");
    meta  = data.weekNo ? `Week ${esc(data.weekNo)}` : "";
    if (!meta && data.description) meta = esc(data.description.slice(0,60));
    const safeOutlineDownload = safePortalUrl(data.downloadLink);
    if (safeOutlineDownload) {
      extraHTML = `<div class="mat-actions">
        <a class="mat-download-btn" href="${esc(safeOutlineDownload)}" target="_blank" rel="noopener noreferrer" download>Download</a>
      </div>`;
    }
  } else if (type === "mat") {
    title = esc(data.fileName || "");
    meta  = data.description ? esc(data.description.slice(0,60)) : "";
    const safeMaterialDownload = safePortalUrl(data.downloadLink);
    if (safeMaterialDownload) {
      extraHTML = `<div class="mat-actions">
        <a class="mat-download-btn" href="${esc(safeMaterialDownload)}" target="_blank" rel="noopener noreferrer" download>Download</a>
      </div>`;
    }
  } else if (type === "sub") {
    title = esc(data.name || "");
    meta  = data.startDate && data.dueDate
      ? `ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã¢â‚¬Â¦ ${esc(data.startDate)} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ${esc(data.dueDate)}`
      : data.dueDate ? `ÃƒÂ¢Ã‚ÂÃ‚Â° Due: ${esc(data.dueDate)}` : "";
  } else if (type === "grd") {
    title = esc(data.assessment || "");
    meta  = data.previousPct != null
      ? `${data.previousPct}% ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ${data.percentage}%`
      : data.percentageDisplay ? `Obtained: ${esc(data.percentageDisplay)}` : "";
  }

  // Unread dot indicator
  const unreadDot = !isRead
    ? `<span class="unread-dot" title="Unread"></span>`
    : "";

  return `<div class="item ${type}${isRead?" item-read":""}">
    <div class="item-course">${unreadDot}${headerLine}</div>
    <div class="item-title">${title || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â"}</div>
    ${meta ? `<div class="item-meta">${meta}</div>` : ""}
    ${extraHTML}
  </div>`;
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Read state helpers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
function doMarkRead(id) {
  if (state.readIds[id]) return;
  state.readIds[id] = true;
  chrome.runtime.sendMessage({ action: "MARK_READ", ids: [id] });
  // Re-render after a moment so unread count updates
  setTimeout(() => render(), 300);
}

function doMarkReadBulk(ids) {
  const fresh = ids.filter(id => !state.readIds[id]);
  if (!fresh.length) return;
  fresh.forEach(id => { state.readIds[id] = true; });
  chrome.runtime.sendMessage({ action: "MARK_READ", ids: fresh });
  setTimeout(() => render(), 300);
}

function onMarkAllRead() {
  // Collect all currently visible unread IDs
  const allItems = [
    ...(state.announcements||[]),
    ...(state.outlines     ||[]),
    ...(state.materials    ||[]),
    ...(state.submissions  ||[]),
    ...(state.grades       ||[]),
  ];
  const unreadIds = allItems.filter(i => !state.readIds[i.id]).map(i => i.id);
  if (!unreadIds.length) return;
  doMarkReadBulk(unreadIds);
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Filter / navigation ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
function typeToLabel(type) {
  return {ann:"Course News",out:"Course Outline",mat:"Course Material",sub:"Course Submission",grd:"Course Grade Book"}[type]||"Update";
}

function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p.dataset.filter === f));
  document.querySelectorAll(".card").forEach(c => c.classList.toggle("active", c.dataset.filter === f));
  const titles = {all:"Recent Updates",ann:"Announcements",out:"Course Outline",mat:"Course Materials",sub:"Submissions",grd:"Grade Updates"};
  document.getElementById("listTitle").textContent = titles[f] || "Updates";
  renderList(f);
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Actions ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
function onClearClick() {
  chrome.runtime.sendMessage({ action: "CLEAR_UPDATES" }, () => {
    state = { announcements:[],outlines:[],materials:[],submissions:[],grades:[],lastScanned:null,readIds:{} };
    expandedIds.clear();
    chrome.storage.local.remove("hz_scan_all_progress");
    render();
  });
}

async function onScanClick() {
  const btn = document.getElementById("scanBtn");
  const st  = document.getElementById("statusText");
  const tabs = await chrome.tabs.query({ url: "https://horizon.ucp.edu.pk/student/course/*/*" });
  if (!tabs.length) {
    st.textContent = "ÃƒÂ¢Ã…Â¡Ã‚Â  Open a course page first";
    document.getElementById("list").innerHTML = `<div class="empty">
      <div class="empty-icon">ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â</div><div class="empty-text">No course page open</div>
      <div class="empty-sub">Open any course tab on <strong>horizon.ucp.edu.pk</strong>, then scan</div></div>`;
    return;
  }
  btn.classList.add("scanning"); btn.textContent = "ScanningÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
  st.textContent = `Scanning ${tabs.length} course(s)ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`;
  chrome.runtime.sendMessage({ action: "TRIGGER_BG_SCAN" }, () => {
    setTimeout(() => { loadData(); btn.classList.remove("scanning"); btn.textContent = "ÃƒÂ¢Ã¢â‚¬Â Ã‚Â» Scan Now"; st.textContent = "Monitoring active"; }, 6000);
  });
}

async function onScanAllClick() {
  const btn   = document.getElementById("scanAllBtn");
  const label = btn.querySelector(".scan-all-label");
  const st    = document.getElementById("statusText");
  btn.classList.add("scanning"); label.textContent = "ScanningÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
  st.textContent = "Sending scan request to dashboardÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦";
  const tabs = await chrome.tabs.query({ url: "https://horizon.ucp.edu.pk/*" });
  if (!tabs.length) {
    st.textContent = "ÃƒÂ¢Ã…Â¡Ã‚Â  Open Horizon portal in a tab first";
    btn.classList.remove("scanning"); label.textContent = "Scan All"; return;
  }
  chrome.tabs.sendMessage(tabs[0].id, { action: "INITIATE_SCAN_ALL" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      st.textContent = "ÃƒÂ¢Ã…Â¡Ã‚Â  Navigate to the Horizon dashboard page first";
      btn.classList.remove("scanning"); label.textContent = "Scan All"; return;
    }
    st.textContent = `Scanning ${res.courses} coursesÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`;
    pollScanAllProgress(btn, label);
  });
}

function pollScanAllProgress(btn, label) {
  const interval = setInterval(() => {
    chrome.storage.local.get("hz_scan_all_progress", (res) => {
      const prog = res.hz_scan_all_progress;
      if (!prog) return;
      const st = document.getElementById("statusText");
      if (prog.running) {
        updateScanAllProgress(prog);
        if (st) st.textContent = `Scanning course ${prog.current} of ${prog.total}ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`;
      } else {
        clearInterval(interval);
        btn.classList.remove("scanning"); label.textContent = "Scan All";
        if (st) st.textContent = "Monitoring active";
        if (prog.summary) showScanAllSummary(prog.summary);
        loadData();
      }
    });
  }, 1200);
}

function updateScanAllProgress(prog) {
  const container = document.getElementById("list");
  if (!container) return;
  const pct = prog.total > 0 ? Math.round((prog.current/prog.total)*100) : 0;
  container.innerHTML = `<div class="scan-all-progress">
    <div class="sap-title">ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â Scanning All Courses</div>
    <div class="sap-bar-wrap"><div class="sap-bar" style="width:${pct}%"></div></div>
    <div class="sap-info">${esc(prog.currentCourse||"InitializingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦")}</div>
    <div class="sap-count">${prog.current} / ${prog.total} courses scanned</div>
  </div>`;
}

function showScanAllSummary(summary) {
  const container = document.getElementById("list");
  if (!container || !summary?.length) return;
  const rows = summary.map(item => {
    const hasUpdates = item.announcements>0||item.outlines>0||item.materials>0||item.submissions>0||item.grades>0;
    const badges = [];
    if (item.announcements>0) badges.push(`<span class="sum-badge ann">${item.announcements} ann</span>`);
    if (item.outlines>0)      badges.push(`<span class="sum-badge out">${item.outlines} out</span>`);
    if (item.materials>0)     badges.push(`<span class="sum-badge mat">${item.materials} mat</span>`);
    if (item.submissions>0)   badges.push(`<span class="sum-badge sub">${item.submissions} sub</span>`);
    if (item.grades>0)        badges.push(`<span class="sum-badge grd">${item.grades} grd</span>`);
    return `<div class="sum-row ${hasUpdates?"has-updates":"no-updates"}">
      <div class="sum-name">${esc(item.courseName)}</div>
      <div class="sum-badges">${hasUpdates?badges.join(""):'<span class="sum-none">No new updates</span>'}</div>
    </div>`;
  }).join("");
  container.innerHTML = `<div class="scan-all-summary">
    <div class="sas-header">
      <span>ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â  ${summary.length} courses scanned</span>
      <button class="sas-dismiss" id="sasDismiss">ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¢ View Updates</button>
    </div>${rows}</div>`;
  document.getElementById("sasDismiss")?.addEventListener("click", () => {
    chrome.storage.local.remove("hz_scan_all_progress");
    renderList(activeFilter);
  });
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
