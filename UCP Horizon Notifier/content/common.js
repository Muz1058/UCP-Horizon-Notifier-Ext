// content/common.js — loaded FIRST on every Horizon course page — v14
//
// SCANNING MODES
// ──────────────
// MODE A  Dashboard "Scan All Courses" (dashboardScanner.js)
//   • Fetches all 4 tabs for every course via fetch().
//   • On completion writes hz_scanned_courses_session = { ids: [courseId,...] }
//     so individual auto-scan can skip already-covered courses.
//
// MODE B  Individual course auto-scan (this file + background SCAN_COURSE)
//   • Fires when a user navigates directly into a course page.
//   • Checks the session flag first — if the course was already handled by
//     Mode A, the scan is skipped (no duplicate work).
//   • Otherwise sends SCAN_COURSE to the background service worker, which
//     fetches all 4 tabs for just this course and stores results.
//
// The per-tab content scanners (announcementScanner.js etc.) ALWAYS run to
// instantly parse whichever tab is currently visible in the browser.

(function (global) {
  "use strict";

  // ── URL helpers ──────────────────────────────────────────────────────────
  function getCourseId() {
    const m = window.location.pathname.match(/\/course\/[^/]+\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function getCourseName() {
    const crumbItems = document.querySelectorAll("#breadcrumbs li");
    if (crumbItems.length >= 2) {
      const a = crumbItems[1].querySelector("a");
      if (a) { const name = a.textContent.trim(); if (name.length > 1) return name; }
    }
    const ukTabA = document.querySelector("ul.uk-tab li:not(.uk-tab-responsive) a");
    if (ukTabA) return ukTabA.textContent.replace(/\(.*?\)/g,"").replace(/\s+/g," ").trim();
    return document.title.split("|")[0].trim() || "Unknown Course";
  }

  function getTabLabel() {
    const crumbItems = document.querySelectorAll("#breadcrumbs li");
    if (crumbItems.length >= 3) {
      const a = crumbItems[crumbItems.length-1].querySelector("a");
      if (a) return a.textContent.trim();
    }
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/info/"))       return "Course News";
    if (path.includes("/material/"))   return "Course Material";
    if (path.includes("/outline/"))    return "Course Outline";
    if (path.includes("/submission/")) return "Course Submission";
    if (path.includes("/gradebook/"))  return "Course Grade Book";
    return "";
  }

  function getCurrentTab() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("/course/info/"))       return "announcement";
    if (path.includes("/course/material/"))   return "material";
    if (path.includes("/course/submission/")) return "submission";
    if (path.includes("/course/gradebook/"))  return "grade";
    if (path.includes("/course/attendance/")) return "attendance";
    if (path.includes("/course/outline/"))    return "outline";
    if (path.includes("/course/assessment/")) return "assessment";
    return "unknown";
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────
  function findTable(requiredKeywords) {
    for (const tbl of document.querySelectorAll("table.uk-table, table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th"))
                       .map(th => th.textContent.trim().toLowerCase());
      const allFound = requiredKeywords.every(req => ths.some(h => h.includes(req)));
      if (!allFound) continue;
      const indexMap = { _all: ths };
      requiredKeywords.forEach(req => { indexMap[req] = ths.findIndex(h => h.includes(req)); });
      return { tbl, indexMap };
    }
    return null;
  }

  // ── Storage ──────────────────────────────────────────────────────────────
  function storageGet(key) {
    return new Promise(r => chrome.storage.local.get(key, res => r(res[key] || null)));
  }
  function storageSet(key, val) {
    return new Promise(r => chrome.storage.local.set({ [key]: val }, r));
  }

  // ── ID hashing ───────────────────────────────────────────────────────────
  function makeId(prefix, ...parts) {
    const s = parts.join("||");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return prefix + "_" + Math.abs(h).toString(36);
  }

  // ── Messaging ────────────────────────────────────────────────────────────
  function sendNotification(id, type, title, message) {
    chrome.runtime.sendMessage({ action:"SEND_NOTIFICATION", payload:{id,type,title,message} }).catch(()=>{});
  }
  function saveUpdates(payload) {
    chrome.runtime.sendMessage({ action:"SAVE_UPDATES", payload }).catch(()=>{});
  }

  // ── Session scan-state ───────────────────────────────────────────────────
  // dashboardScanner writes hz_scanned_courses_session = { ids: [...courseId] }
  // after a Scan All run. We read it here to skip duplicate scans.
  function wasCourseGloballyScanned(courseId) {
    return new Promise(r => {
      chrome.storage.local.get("hz_scanned_courses_session", res => {
        const rec = res.hz_scanned_courses_session;
        r(!!(rec && Array.isArray(rec.ids) && rec.ids.includes(courseId)));
      });
    });
  }

  // ── MODE B: individual course auto-scan ──────────────────────────────────
  async function triggerBackgroundScan() {
    const courseId = getCourseId();
    if (!courseId) return;

    const alreadyScanned = await wasCourseGloballyScanned(courseId);
    if (alreadyScanned) return;
    chrome.runtime.sendMessage({ action:"SCAN_COURSE", courseId }).catch(()=>{});
  }

  // ── Mark all stored items for the current tab as read ───────────────────
  // Called after the page-specific scanner has run (delay ensures items are stored).
  // This implements "visiting a tab = marking those items as read".
  // ── Auto-mark current tab as read ───────────────────────────────────────
  // When user visits a course tab, mark all items for THAT tab+course as read.
  // Matching uses courseId (from the URL) — precise, no name ambiguity.
  // Items without courseId fall back to exact courseName match (cleaned).

  function markCurrentTabAsRead() {
    const tab      = getCurrentTab();
    const courseId = getCourseId();
    if (!courseId) return;

    const keyMap = {
      announcement: "hz_announcements",
      outline:      "hz_outlines",
      material:     "hz_materials",
      submission:   "hz_submissions",
      grade:        "hz_grades",
    };
    const storageKey = keyMap[tab];
    if (!storageKey) return;

    const cn = cleanName(getCourseName());

    chrome.storage.local.get([storageKey, "hz_read_ids"], res => {
      const items   = res[storageKey] || [];
      const readIds = res.hz_read_ids || {};

      const toMark = items
        .filter(item => {
          if (readIds[item.id]) return false; // already read — skip
          // Match by courseId (items saved by courseProxy have it)
          if (item.courseId && item.courseId === courseId) return true;
          // Match by courseName — normalize both sides identically.
          // Tab scanners save items without courseId, so name match is the fallback.
          // Exact match only — no fuzzy/contains to avoid lab-vs-theory cross-marking.
          const itemCn = cleanName(item.courseName || "");
          return itemCn === cn;
        })
        .map(item => item.id);

      if (!toMark.length) return;

      chrome.runtime.sendMessage({ action: "MARK_READ", ids: toMark }).catch(() => {
        const rd = { ...readIds };
        toMark.forEach(id => { rd[id] = true; });
        chrome.storage.local.set({ hz_read_ids: rd });
      });
    });
  }

  function cleanName(s) {
    return String(s).replace(/\(.*?\)/g,"").replace(/\s+\d+$/,"").replace(/\s+/g," ").trim().toLowerCase();
  }

  // ── Export ───────────────────────────────────────────────────────────────
  global.HZUtils = {
    makeId, getCourseId, getCourseName, getTabLabel, getCurrentTab,
    findTable, storageGet, storageSet,
    sendNotification, saveUpdates,
    triggerBackgroundScan, wasCourseGloballyScanned,
    markCurrentTabAsRead,
  };

  // ── Boot ─────────────────────────────────────────────────────────────────
  const tab = getCurrentTab();
  // On any course sub-page, trigger MODE B scan after page settles
  if (["announcement","material","submission","grade","attendance","outline","assessment"].includes(tab)) {
    setTimeout(triggerBackgroundScan, 2000);
  }

  // Auto-mark: when user visits a tab, mark that tab's items for this course as read.
  // Run at 1.8s (tab scanner writes at 1.5s), 3.5s and 6s to catch background scan writes too.
  if (["announcement","outline","material","submission","grade"].includes(tab)) {
    setTimeout(markCurrentTabAsRead, 1800);
    setTimeout(markCurrentTabAsRead, 3500);
    setTimeout(markCurrentTabAsRead, 6000);
  }

})(window);
