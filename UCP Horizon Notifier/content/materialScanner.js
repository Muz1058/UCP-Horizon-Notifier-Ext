// content/materialScanner.js — v20
// Runs on /student/course/material/{id}
// Single write path: SAVE_UPDATES only
// fetchStatus flags prevent wiping other tab types from storage
(function () {
  "use strict";
  async function run() {
    const { getCurrentTab, getCourseId, getCourseName, getTabLabel, findTable, makeId, saveUpdates } = window.HZUtils;
    if (getCurrentTab() !== "material") return;
    const courseId = getCourseId();
    const course   = getCourseName();
    const tabLabel = getTabLabel() || "Course Material";
    const found    = findTable(["material"]);
    if (!found) return;
    const { tbl, indexMap } = found;
    const H     = indexMap._all;
    const iFile = H.findIndex(h => h.includes("material") || h.includes("file"));
    const iDesc = H.findIndex(h => h.includes("desc"));
    const iDl   = H.findIndex(h => h.includes("download"));
    const fresh = [];
    tbl.querySelectorAll("tbody tr").forEach(row => {
      const td       = row.querySelectorAll("td");
      if (td.length < 2) return;
      const fileName = td[iFile >= 0 ? iFile : 1]?.textContent.trim() || "";
      const desc     = td[iDesc >= 0 ? iDesc : 2]?.textContent.trim() || "";
      let dlLink     = (iDl >= 0 && td[iDl]) ? td[iDl].querySelector("a[href]")?.href || null : null;
      if (!dlLink) dlLink = row.querySelector("a[href*='/material/download/'], a[href*='/download/']")?.href || null;
      if (!fileName || fileName.length < 2) return;
      fresh.push({
        id: makeId("mat", course, fileName, dlLink || desc),
        courseName: course, tabLabel,
        fileName, description: desc, downloadLink: dlLink,
        scannedAt: new Date().toISOString(),
      });
    });
    if (!fresh.length) return;
    // fetchStatus: only materials fetched — do NOT touch other stored types
    saveUpdates({
      announcements: [], materials: fresh, submissions: [], grades: [], outlines: [],
      fetchStatus: {
        announcements: false,
        materials:     true,
        submissions:   false,
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
