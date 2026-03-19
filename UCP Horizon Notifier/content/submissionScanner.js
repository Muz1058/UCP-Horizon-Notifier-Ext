// content/submissionScanner.js — v20 — single write path
// fetchStatus flags prevent wiping other tab types from storage
(function () {
  "use strict";
  async function run() {
    const { getCurrentTab, getCourseName, getTabLabel, makeId, saveUpdates } = window.HZUtils;
    if (getCurrentTab() !== "submission") return;
    const course   = getCourseName();
    const tabLabel = getTabLabel() || "Course Submission";
    let tbl = null;
    for (const t of document.querySelectorAll("table")) {
      const ths = Array.from(t.querySelectorAll("thead th")).map(h => h.textContent.trim().toLowerCase());
      if (ths.some(h => h === "name") && ths.some(h => h.includes("due"))) { tbl = t; break; }
    }
    if (!tbl) return;
    let rows = Array.from(tbl.querySelectorAll("tbody tr[submission_id]"));
    if (!rows.length) rows = Array.from(tbl.querySelectorAll("tbody tr"))
      .filter(r => !r.textContent.trim().toLowerCase().includes("no submission") && r.querySelectorAll("td").length >= 4);
    const fresh = [];
    rows.forEach(row => {
      const nameTd  = row.querySelector("td.rec_submission_title");
      const startTd = row.querySelector("td.rec_submission_date");
      const dueTd   = row.querySelector("td.rec_submission_due_date");
      const td = row.querySelectorAll("td");
      const name      = (nameTd  || td[1])?.textContent.trim() || "";
      const startDate = (startTd || td[3])?.textContent.trim() || "";
      const dueDate   = (dueTd   || td[4])?.textContent.trim() || "";
      const subId     = row.getAttribute("submission_id") || "";
      if (!name || name.length < 2) return;
      fresh.push({
        id: makeId("sub", course, subId || name, startDate),
        courseName: course, tabLabel, name, startDate, dueDate,
        scannedAt: new Date().toISOString(),
      });
    });
    if (!fresh.length) return;
    // fetchStatus: only submissions fetched — do NOT touch other stored types
    saveUpdates({
      announcements: [], materials: [], submissions: fresh, grades: [], outlines: [],
      fetchStatus: {
        announcements: false,
        materials:     false,
        submissions:   true,
        grades:        false,
        outlines:      false,
      },
    });
  }
  function boot() {
    if (!window.HZUtils) { setTimeout(boot, 100); return; }
    setTimeout(run, 1500);
    chrome.runtime.onMessage.addListener(msg => { if (msg.action === "TRIGGER_SCAN") setTimeout(run, 500); });
  }
  boot();
})();
