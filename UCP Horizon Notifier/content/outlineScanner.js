// content/outlineScanner.js — v20
// Runs on /student/course/outline/{id}
// Single write path: SAVE_UPDATES only
// fetchStatus flags prevent wiping other tab types from storage
(function () {
  "use strict";

  function parseOutlineRows() {
    const tables = Array.from(document.querySelectorAll("table"));
    const items = [];
    const courseId = window.HZUtils.getCourseId();
    const course = window.HZUtils.getCourseName();
    const tabLabel = window.HZUtils.getTabLabel() || "Course Outline";

    for (const tbl of tables) {
      const headers = Array.from(tbl.querySelectorAll("thead th")).map(th => th.textContent.trim().toLowerCase());
      if (!headers.some(h => h.includes("week")) || !headers.some(h => h.includes("download"))) continue;

      const iWeek  = headers.findIndex(h => h.includes("week"));
      const iBody  = headers.findIndex(h => h.includes("content"));
      const iFiles = headers.findIndex(h => h.includes("files"));

      tbl.querySelectorAll("tbody tr").forEach(row => {
        const cells = row.querySelectorAll("td");
        const link = row.querySelector("a[href*='/student/breakdown/download/'], a[href*='/breakdown/download/']");
        if (!cells.length || !link) return;

        const weekNo       = cells[iWeek  >= 0 ? iWeek  : 0]?.textContent.trim() || "";
        const contents     = cells[iBody  >= 0 ? iBody  : 1]?.textContent.replace(/\s+/g, " ").trim() || "";
        const filesLabel   = cells[iFiles >= 0 ? iFiles : 3]?.textContent.replace(/\s+/g, " ").trim() || "";
        const downloadLink = link.href || "";
        if (!downloadLink) return;

        const title = weekNo ? `Week ${weekNo}` : "Course Outline";
        items.push({
          id: window.HZUtils.makeId("out", course, weekNo, downloadLink),
          courseName: course,
          courseId,
          tabLabel,
          title,
          weekNo,
          description: contents.substring(0, 300),
          fileName: filesLabel || title,
          downloadLink,
          scannedAt: new Date().toISOString(),
        });
      });
    }

    return items;
  }

  async function run() {
    const { getCurrentTab, saveUpdates } = window.HZUtils;
    if (getCurrentTab() !== "outline") return;

    const fresh = parseOutlineRows();
    if (!fresh.length) return;

    // fetchStatus: only outlines fetched — do NOT touch other stored types
    saveUpdates({
      announcements: [], materials: [], submissions: [], grades: [], outlines: fresh,
      fetchStatus: {
        announcements: false,
        materials:     false,
        submissions:   false,
        grades:        false,
        outlines:      true,
      },
    });
  }

  function boot() {
    if (!window.HZUtils) { setTimeout(boot, 100); return; }
    setTimeout(run, 1500);
    chrome.runtime.onMessage.addListener(msg => {
      if (msg.action === "TRIGGER_SCAN") setTimeout(run, 500);
    });
  }

  boot();
})();
