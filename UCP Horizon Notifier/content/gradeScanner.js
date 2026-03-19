// content/gradeScanner.js — v20 — single write path
// fetchStatus flags prevent wiping other tab types from storage
(function () {
  "use strict";
  async function run() {
    const { getCurrentTab, getCourseName, getTabLabel, makeId, saveUpdates } = window.HZUtils;
    if (getCurrentTab() !== "grade") return;
    const course   = getCourseName();
    const tabLabel = getTabLabel() || "Course Grade Book";
    let tbl = null;
    for (const t of document.querySelectorAll("table")) {
      const ths = Array.from(t.querySelectorAll("thead th")).map(h => h.textContent.trim().toLowerCase());
      if (ths.some(h => h.includes("assessment"))) { tbl = t; break; }
    }
    if (!tbl) return;
    const ths   = Array.from(tbl.querySelectorAll("thead th")).map(h => h.textContent.trim().toLowerCase());
    const iType = ths.findIndex(h => h.includes("assessment"));
    const iPct  = ths.findIndex(h => h.includes("percentage") || h.includes("obtained") || h.includes("marks"));
    const fresh = [];
    tbl.querySelectorAll("tbody tr").forEach(row => {
      const td         = row.querySelectorAll("td");
      if (td.length < 1) return;
      const assessment = td[iType >= 0 ? iType : 0]?.textContent.trim() || "";
      const rawPct     = td[iPct  >= 0 ? iPct  : 1]?.textContent.trim() || "";
      if (!assessment || assessment.length < 2) return;
      const numeric = parseFloat(rawPct.replace(/[^\d.]/g, ""));
      fresh.push({
        id: makeId("grd", course, assessment),
        courseName: course, tabLabel, assessment,
        percentage: isNaN(numeric) ? null : numeric,
        percentageDisplay: rawPct || "—",
        scannedAt: new Date().toISOString(),
      });
    });
    if (!fresh.length) return;
    // fetchStatus: only grades fetched — do NOT touch other stored types
    saveUpdates({
      announcements: [], materials: [], submissions: [], grades: fresh, outlines: [],
      fetchStatus: {
        announcements: false,
        materials:     false,
        submissions:   false,
        grades:        true,
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
