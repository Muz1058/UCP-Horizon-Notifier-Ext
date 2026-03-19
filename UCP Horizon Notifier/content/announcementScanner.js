// content/announcementScanner.js — v19
// Runs on /student/course/info/{id}
// Single write path: SAVE_UPDATES only (no direct storageSet)
(function () {
  "use strict";
  async function run() {
    const { getCurrentTab, getCourseName, getTabLabel, findTable, makeId,
            sendNotification, saveUpdates } = window.HZUtils;
    if (getCurrentTab() !== "announcement") return;
    const course   = getCourseName();
    const tabLabel = getTabLabel() || "Course News";
    const found    = findTable(["subject"]);
    if (!found) return;
    const { tbl, indexMap } = found;
    const H     = indexMap._all;
    const iSubj = H.findIndex(h => h.includes("subject"));
    const iDate = H.findIndex(h => h.includes("date"));
    const iDesc = H.findIndex(h => h.includes("desc"));
    const iAtt  = H.findIndex(h => h.includes("attach"));
    const fresh = [];
    tbl.querySelectorAll("tbody tr").forEach(row => {
      const td = row.querySelectorAll("td");
      if (td.length < 3) return;
      const subject = td[iSubj >= 0 ? iSubj : 1]?.textContent.trim() || "";
      const date    = td[iDate >= 0 ? iDate : 2]?.textContent.trim() || "";
      const desc    = td[iDesc >= 0 ? iDesc : 3]?.textContent.trim() || "";
      const attLink = (iAtt >= 0 && td[iAtt]) ? td[iAtt].querySelector("a[href]")?.href || null : null;
      if (!subject || subject.length < 2) return;
      fresh.push({
        id: makeId("ann", course, subject, date),
        courseName: course, tabLabel,
        subject, date, description: desc.substring(0, 300), attachmentLink: attLink,
        scannedAt: new Date().toISOString(),
      });
    });
    if (!fresh.length) return;
    // Single write via SAVE_UPDATES — background handles replace-by-course dedup
    saveUpdates({ announcements: fresh, materials: [], submissions: [], grades: [] });
  }
  function boot() {
    if (!window.HZUtils) { setTimeout(boot, 100); return; }
    setTimeout(run, 1500);
    chrome.runtime.onMessage.addListener(msg => { if (msg.action === "TRIGGER_SCAN") setTimeout(run, 500); });
  }
  boot();
})();
