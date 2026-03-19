// content/dashboardScanner.js - v16 production
// Dashboard "Scan All Courses" + in-page Updates Panel with read/unread tracking.
// Single source of truth: syncUnreadCount() keeps toolbar badge + panel header in sync.

(function () {
  "use strict";

  const PANEL_ID      = "hz-updates-panel";
  let   _panelShowAll  = false;
  let   _unreadCount   = 0;
  let   _syncDebounce  = null;   // debounce for storage.onChanged ? syncUnreadCount
  let   _lastCourseCount = "";   // set after scan, used by syncUnreadCount for status text
  let   _statusHideTimer = null; // hides transient completion status

  // -- Detect dashboard ------------------------------------------------------
  function isDashboard() {
    const path = window.location.pathname.toLowerCase();
    return path.includes("/student/dashboard") || path.includes("/student/home") ||
           path === "/student/" || path === "/student";
  }

  // -- Collect course links --------------------------------------------------
  function collectCourseLinks() {
    const courses = [], seen = new Set();
    document.querySelectorAll('a[href*="/student/course/info/"]').forEach(a => {
      const href = a.getAttribute("href");
      if (!href) return;
      const m = href.match(/\/student\/course\/info\/([^/?#]+)/);
      if (!m) return;
      const courseId = m[1];
      if (seen.has(courseId)) return;
      seen.add(courseId);
      // Extract ONLY the course name span - never use card-header textContent
      // (card-header also contains the injected badge span whose number would corrupt the name)
      const nameSpan = a.querySelector(".card-header span:not(.hz-card-badge)");
      let name = nameSpan ? nameSpan.textContent.trim() : "";
      if (!name) name = a.querySelector(".card-title, h6")?.textContent.trim() || courseId;
      // Strip any trailing numbers that may have leaked in
      name = name.replace(/\s+\d+$/, "").replace(/\s+/g, " ").trim();
      const base = window.location.origin;
      courses.push({
        courseId, courseName: name,
        infoUrl:       `${base}/student/course/info/${courseId}`,
      outlineUrl:    `${base}/student/course/outline/${courseId}`,
      materialUrl:   `${base}/student/course/material/${courseId}`,
      submissionUrl: `${base}/student/course/submission/${courseId}`,
        gradeUrl:      `${base}/student/course/gradebook/${courseId}`,
      });
    });
    return courses;
  }

  // -- Single source of truth for unread count -------------------------------
  // Reads from storage, updates ALL counts atomically - single source of truth.
  // Updates: toolbar badge, status text, panel header, panel tabs, card badges.
  function syncUnreadCount(cb) {
    chrome.storage.local.get(
      ["hz_announcements","hz_outlines","hz_materials","hz_submissions","hz_grades","hz_read_ids"],
      res => {
        const rd  = res.hz_read_ids || {};
        const all = [
          ...(res.hz_announcements||[]), ...(res.hz_outlines||[]), ...(res.hz_materials||[]),
          ...(res.hz_submissions  ||[]), ...(res.hz_grades   ||[]),
        ];
        _unreadCount = all.filter(i => !rd[i.id]).length;
        const total  = all.length;

        // Toolbar badge - always in sync with storage
        const badge = document.getElementById("hz-update-badge");
        if (badge) badge.textContent = _unreadCount > 0 ? _unreadCount : "";

        // Status text - always matches badge (no race condition)
        const status = document.getElementById("hz-scan-status");
        if (status && total > 0 && !document.getElementById("hz-scan-all-btn")?.disabled) {
          // Only update status when not currently scanning
          status.textContent = _unreadCount > 0
            ? `${_unreadCount} unread update${_unreadCount!==1?"s":""} across ${_lastCourseCount||""} courses`
            : total > 0 ? `Done - All caught up across ${_lastCourseCount||""} courses` : "";
        }

        // Panel header subtitle (if panel is open)
        const sub = document.getElementById("hz-panel-subtitle");
        if (sub) {
          sub.innerHTML = _unreadCount > 0
            ? `<span class="hz-unread-pill">${_unreadCount} unread</span><span class="hz-total-text"> - ${total} total</span>`
            : `<span class="hz-all-read-text">All ${total} item${total!==1?"s":""} read</span>`;
        }

        if (cb) cb(_unreadCount, total);
        refreshCardBadges();
        _updatePanelTabBadges(res);
      }
    );
  }

  // Live-update all panel counts and item states from fresh storage data
  function _updatePanelTabBadges(res) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const rd  = (res && res.hz_read_ids) ? res.hz_read_ids : {};
    const ann = res && res.hz_announcements ? res.hz_announcements.filter(i=>!rd[i.id]).length : 0;
    const out = res && res.hz_outlines      ? res.hz_outlines.filter(i=>!rd[i.id]).length      : 0;
    const mat = res && res.hz_materials     ? res.hz_materials.filter(i=>!rd[i.id]).length     : 0;
    const sub = res && res.hz_submissions   ? res.hz_submissions.filter(i=>!rd[i.id]).length   : 0;
    const grd = res && res.hz_grades        ? res.hz_grades.filter(i=>!rd[i.id]).length        : 0;
    const all = ann + out + mat + sub + grd;
    const map = { all, ann, out, mat, sub, grd };

    // Update tab badges
    panel.querySelectorAll(".hz-tab").forEach(btn => {
      const cnt = btn.querySelector(".hz-tab-cnt");
      if (!cnt) return;
      const key = btn.dataset.filter;
      const n   = map[key] ?? 0;
      cnt.textContent = n;
      cnt.classList.toggle("zero", n === 0);
    });

    // Update panel header subtitle
    const total = (res.hz_announcements||[]).length + (res.hz_outlines||[]).length + (res.hz_materials||[]).length +
                  (res.hz_submissions||[]).length   + (res.hz_grades||[]).length;
    const sub2 = document.getElementById("hz-panel-subtitle");
    if (sub2) {
      sub2.innerHTML = all > 0
        ? `<span class="hz-unread-pill">${all} unread</span><span class="hz-total-text"> - ${total} total</span>`
        : `<span class="hz-all-read-text">All ${total} item${total!==1?"s":""} read</span>`;
    }

    // Update individual item unread dots and dim state based on fresh read IDs
    // (items marked read from another tab need their dots removed)

    if (!_panelShowAll) {
  panel.querySelectorAll(".hz-item[data-item-id]").forEach(el => {
    const id   = el.dataset.itemId;
    const isNowRead = id && !!rd[id];
    if (isNowRead) {
      el.querySelector(".hz-udot")?.remove();
      // Don't dim if the detail box is currently open
      const detailBtn = el.querySelector(".hz-dbtn");
      const isDetailOpen = detailBtn && detailBtn.classList.contains("open");
      if (!isDetailOpen) {
        el.classList.add("dim");
      }
    }
  });
} 
    else {
      panel.querySelectorAll(".hz-item[data-item-id]").forEach(el => {
        const id = el.dataset.itemId;
        if (id && !!rd[id]) el.querySelector(".hz-udot")?.remove();
        // No dim in show-all mode
      });
    }

    // Update course section unread dots
    panel.querySelectorAll(".hz-ctoggle").forEach(btn => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const sectionItems = target.querySelectorAll(".hz-item[data-item-id]");
      const hasUnread = Array.from(sectionItems).some(el => el.dataset.itemId && !rd[el.dataset.itemId]);
      const dot = btn.querySelector(".hz-cdot");
      if (dot && !hasUnread) dot.remove();
    });
  }

  // -- Mark IDs as read ------------------------------------------------------
  function markReadIds(ids) {
    if (!ids || !ids.length) return;
    chrome.runtime.sendMessage({ action:"MARK_READ", ids }).catch(()=>{});
    setTimeout(syncUnreadCount, 250);
  }

  // -- Inject toolbar --------------------------------------------------------
  function injectToolbar() {
    if (document.getElementById("hz-dashboard-toolbar")) return;

    // Scoped CSS injected once
    if (!document.getElementById("hz-styles")) {
      const style = document.createElement("style");
      style.id = "hz-styles";
      style.textContent = `
        /* -- Horizon Assistant - Native Portal Theme -------------------------
           Matches UCP portal: Roboto/sans-serif, Bootstrap 5 palette, #004878 navy */

        #hz-dashboard-toolbar {
          margin: 8px 0 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 14px;
        }

        /* Scan All - matches portal's dark primary button */
        #hz-scan-all-btn {
          background-color: #004878;
          color: #fff;
          border: 1px solid #004878;
          padding: 6px 14px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: inherit;
          line-height: 1.5;
          transition: background-color .15s, border-color .15s;
          text-decoration: none;
        }
        #hz-scan-all-btn:hover { background-color: #0d1f38; border-color: #0d1f38; }
        #hz-scan-all-btn:disabled { opacity: .65; pointer-events: none; }

        /* Updates - matches portal's outline button */
        #hz-view-updates-btn {
          background-color: #fff;
          color: #004878;
          border: 1px solid #004878;
          padding: 6px 14px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: none;
          align-items: center;
          gap: 6px;
          font-family: inherit;
          line-height: 1.5;
          transition: background-color .15s, color .15s;
        }
        #hz-view-updates-btn:hover { background-color: #004878; color: #fff; }

        #hz-update-badge {
          background: #dc3545;
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          border-radius: 10px;
          padding: 1px 6px;
          min-width: 18px;
          text-align: center;
          line-height: 1.4;
        }
        #hz-scan-status {
          font-size: 13px;
          color: #6c757d;
          font-family: inherit;
        }

        /* -- Slide-in panel -------------------------------------------------- */
        #hz-updates-panel {
          position: fixed;
          top: 0; right: 0;
          width: 380px;
          height: 100vh;
          background: #f8f9fa;
          box-shadow: -2px 0 12px rgba(0,0,0,.15);
          z-index: 99999;
          display: flex;
          flex-direction: column;
          font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 14px;
          color: #212529;
          transform: translateX(100%);
          transition: transform .25s ease-in-out;
          border-left: 1px solid #dee2e6;
        }

        /* Panel header - portal navy */
        .hz-ph {
          background: #004878;
          padding: 12px 16px 10px;
          flex-shrink: 0;
        }
        .hz-ph-row1 {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .hz-ph-title {
          font-weight: 600;
          font-size: 14px;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 0;
        }
        .hz-ph-actions { display: flex; gap: 4px; align-items: center; }

        /* Header buttons - ghost style */
        .hz-abtn {
          background: rgba(255,255,255,.1);
          border: 1px solid rgba(255,255,255,.25);
          color: #fff;
          padding: 3px 8px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          font-family: inherit;
          transition: background .12s;
          white-space: nowrap;
          line-height: 1.5;
        }
        .hz-abtn:hover { background: rgba(255,255,255,.2); }
        .hz-ibtn {
          background: rgba(255,255,255,.1);
          border: 1px solid rgba(255,255,255,.25);
          color: #fff;
          width: 26px; height: 26px;
          border-radius: 3px;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background .12s;
          flex-shrink: 0;
          padding: 0;
        }
        .hz-ibtn:hover { background: rgba(255,255,255,.2); }

        #hz-panel-subtitle {
          font-size: 12px;
          color: rgba(255,255,255,.7);
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 14px;
        }
        .hz-unread-pill {
          background: #ffc107;
          color: #212529;
          font-weight: 600;
          font-size: 11px;
          padding: 1px 7px;
          border-radius: 10px;
        }
        .hz-total-text  { color: rgba(255,255,255,.55); font-size: 12px; }
        .hz-all-read-text { color: #6ee7b7; font-size: 12px; }

        /* Filter tabs - Bootstrap-style nav */
        .hz-tabs {
          display: flex;
          background: #fff;
          border-bottom: 1px solid #dee2e6;
          flex-shrink: 0;
        }
        .hz-tab {
          flex: 1;
          padding: 8px 4px;
          border: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          background: transparent;
          color: #6c757d;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
          transition: color .12s, border-color .12s;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          line-height: 1.3;
        }
        .hz-tab.active { color: #004878; border-bottom-color: #004878; }
        .hz-tab:hover:not(.active) { color: #343a40; background: #f8f9fa; }
        .hz-tab-cnt {
          font-size: 10px;
          font-weight: 600;
          background: #dc3545;
          color: #fff;
          border-radius: 8px;
          padding: 0 5px;
          min-width: 16px;
          text-align: center;
          line-height: 1.5;
        }
        .hz-tab-cnt.zero { background: #e9ecef; color: #adb5bd; }

        /* Panel body */
        #hz-panel-body { flex: 1; overflow-y: auto; }
        #hz-panel-body::-webkit-scrollbar { width: 4px; }
        #hz-panel-body::-webkit-scrollbar-thumb { background: #ced4da; border-radius: 4px; }

        /* Panel footer */
        .hz-footer {
          border-top: 1px solid #dee2e6;
          padding: 8px 14px;
          font-size: 12px;
          color: #6c757d;
          background: #fff;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .hz-footer a { color: #dc3545; text-decoration: none; }
        .hz-footer a:hover { text-decoration: underline; }
        .hz-footer-close {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          color: #495057;
          padding: 3px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          transition: background .12s;
          line-height: 1.5;
        }
        .hz-footer-close:hover { background: #e9ecef; }

        /* Floating toggle arrow - sits on the left edge of the panel */
        .hz-panel-toggle-arrow {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          right: 0;
          width: 20px;
          height: 48px;
          background: #009688;
          color: #fff;
          border: none;
          border-radius: 4px 0 0 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99998;
          transition: right .25s ease-in-out, background .12s;
          box-shadow: -2px 0 6px rgba(0,0,0,.15);
          padding: 0;
        }
        .hz-panel-toggle-arrow:hover { background: #0d1f38; }
        .hz-panel-toggle-arrow svg { transition: transform .25s; }

        /* Course sections */
        .hz-cs { border-bottom: 1px solid #dee2e6; background: #fff; }
        .hz-ctoggle {
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          padding: 10px 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: inherit;
          font-size: 13px;
          transition: background .1s;
        }
        .hz-ctoggle:hover { background: #f8f9fa; }
        .hz-cname {
          font-weight: 600;
          font-size: 13px;
          color: #212529;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
        }
        .hz-cname-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hz-cdot { width: 7px; height: 7px; border-radius: 50%; background: #dc3545; flex-shrink: 0; }
        .hz-badge-row { display: flex; gap: 3px; flex-wrap: wrap; }
        .hz-tbadge {
          font-size: 10px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 10px;
          white-space: nowrap;
          line-height: 1.4;
        }
        .hz-chev {
          color: #adb5bd;
          font-size: 16px;
          transition: transform .2s;
          flex-shrink: 0;
          line-height: 1;
          font-style: normal;
        }

        /* Item list */
        .hz-citems { display: none; padding: 0 10px 10px; background: #f8f9fa; }

        .hz-item {
          border-left: 3px solid;
          border-radius: 4px;
          padding: 8px 10px;
          margin-bottom: 6px;
          background: #fff;
          border: 1px solid #dee2e6;
          border-left-width: 3px;
          transition: box-shadow .12s;
        }
        .hz-item:hover { box-shadow: 0 1px 4px rgba(0,0,0,.1); }
        .hz-item.dim { opacity: .45; }

        .hz-itype {
          font-size: 10px;
          font-weight: 600;
          color: #6c757d;
          text-transform: uppercase;
          letter-spacing: .5px;
          margin-bottom: 3px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .hz-udot { width: 6px; height: 6px; border-radius: 50%; background: #dc3545; flex-shrink: 0; }
        .hz-ititle { font-size: 13px; font-weight: 500; color: #212529; line-height: 1.4; }
        .hz-imeta  { font-size: 12px; color: #6c757d; margin-top: 2px; display: flex; align-items: center; gap: 4px; }

        /* View Details button - Bootstrap outline-warning */
        .hz-dbtn {
          margin-top: 6px;
          font-size: 12px;
          border: 1px solid #ffc107;
          background: transparent;
          color: #856404;
          border-radius: 3px;
          padding: 2px 10px;
          cursor: pointer;
          font-weight: 500;
          font-family: inherit;
          transition: all .12s;
          line-height: 1.5;
        }
        .hz-dbtn:hover, .hz-dbtn.open { background: #ffc107; color: #212529; }
        .hz-dbox {
          display: none;
          margin-top: 6px;
          background: #fffbe6;
          border: 1px solid #ffc107;
          border-radius: 3px;
          padding: 8px 10px;
        }
        .hz-dtext { font-size: 12px; color: #212529; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
        .hz-attlink {
          display: inline-flex; align-items: center; gap: 4px;
          margin-top: 6px; font-size: 12px; color: #0d6efd; font-weight: 500; text-decoration: none;
        }
        .hz-attlink:hover { text-decoration: underline; }

        /* Download - Bootstrap outline-primary */
        .hz-dlbtn {
          display: inline-flex; align-items: center; gap: 4px;
          margin-top: 5px; font-size: 12px; font-weight: 500; color: #0d6efd;
          text-decoration: none; border: 1px solid #0d6efd;
          padding: 2px 10px; border-radius: 3px; transition: all .12s; line-height: 1.5;
        }
        .hz-dlbtn:hover { background: #0d6efd; color: #fff; }

        /* Empty / progress states */
        .hz-empty { text-align: center; padding: 40px 20px; color: #6c757d; }
        .hz-empty-icon { font-size: 32px; margin-bottom: 10px; }
        .hz-empty-title { font-size: 14px; font-weight: 600; color: #495057; margin-bottom: 5px; }
        .hz-empty-sub { font-size: 12px; line-height: 1.5; }
        .hz-empty-sub a { color: #0d6efd; text-decoration: none; }

        .hz-prog { padding: 24px 16px; text-align: center; }
        .hz-prog-title { font-size: 14px; font-weight: 600; color: #212529; margin-bottom: 12px; }
        .hz-prog-bg { background: #dee2e6; border-radius: 4px; height: 6px; overflow: hidden; margin-bottom: 8px; }
        .hz-prog-bar { height: 100%; background: #004878; border-radius: 4px; transition: width .4s ease; }
        .hz-prog-course { font-size: 12px; color: #495057; margin-bottom: 2px; }
        .hz-prog-count  { font-size: 11px; color: #6c757d; }

        /* Course card badges - inside .card-header */
        .hz-card-badge {
          display: inline-flex; align-items: center; justify-content: center;
          background: #dc3545; color: #fff;
          font-size: 11px; font-weight: 600;
          min-width: 20px; height: 20px; border-radius: 10px; padding: 0 5px;
          flex-shrink: 0; box-shadow: 0 1px 3px rgba(220,53,69,.4);
          animation: hz-pop .2s cubic-bezier(.34,1.56,.64,1) both; line-height: 1;
        }
        @keyframes hz-pop { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }

        .hz-card-glow {
          outline: 2px solid rgba(13,110,253,.5) !important;
          outline-offset: 1px;
          transition: outline .25s;
        }

        /* Tooltip */
        .hz-tooltip {
          position: absolute; background: #212529; color: #f8f9fa;
          font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 12px; padding: 8px 10px; border-radius: 4px;
          box-shadow: 0 3px 10px rgba(0,0,0,.25);
          z-index: 999999; pointer-events: none;
          max-width: 220px; min-width: 150px;
          animation: hz-fade .12s ease;
        }
        @keyframes hz-fade { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:none} }
        .hz-tip-course { font-size: 11px; font-weight: 600; color: #ffc107; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hz-tip-line   { padding: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; }
        .hz-tip-more   { margin-top: 4px; font-size: 10px; color: #adb5bd; border-top: 1px solid rgba(255,255,255,.1); padding-top: 4px; }
      `;
      document.head.appendChild(style);
    }

    const heading = Array.from(document.querySelectorAll("h3.heading_a,h3"))
      .find(h => h.textContent.trim().includes("Classes, Grades"));

    const toolbar = document.createElement("div");
    toolbar.id = "hz-dashboard-toolbar";
    toolbar.innerHTML = `
      <button id="hz-scan-all-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span id="hz-scan-label">Scan All Courses</span>
      </button>
      <button id="hz-view-updates-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        Updates
        <span id="hz-update-badge"></span>
      </button>
      <span id="hz-scan-status"></span>
    `;

    if (heading && heading.parentNode) heading.parentNode.insertBefore(toolbar, heading.nextSibling);
    else { const c = document.querySelector(".md-card-content,main,.uk-container"); if(c) c.prepend(toolbar); }

    document.getElementById("hz-scan-all-btn").addEventListener("click", startScanAll);
    document.getElementById("hz-view-updates-btn").addEventListener("click", togglePanel);

    // Inject persistent toggle arrow
    _ensureToggleArrow();

    // Populate badge from existing stored data
    syncUnreadCount((unread, total) => {
      if (total > 0) document.getElementById("hz-view-updates-btn").style.display = "inline-flex";
    });
    // Inject course card badges from stored data
    injectCardBadges();
  }

  // -- Scan All orchestrator -------------------------------------------------
  async function startScanAll() {
    const scanBtn = document.getElementById("hz-scan-all-btn");
    const label   = document.getElementById("hz-scan-label");
    const status  = document.getElementById("hz-scan-status");

    const courses = collectCourseLinks();
    if (!courses.length) { if(status) status.textContent="No courses found."; return; }

    if (scanBtn) scanBtn.disabled = true;
    if (label)   label.textContent = "Scanning...";
    if (status)  status.textContent = `Found ${courses.length} courses...`;

    await setProgress({ running:true, current:0, total:courses.length, currentCourse:"", summary:null });
    if (document.getElementById(PANEL_ID)) _showProgress(0, courses.length, "");

    const summary = [], scannedIds = [];
    let failedRequests = 0;
    let failedCourses = 0;

    for (let i = 0; i < courses.length; i++) {
      const c = courses[i];
      if (label)  label.textContent  = `Scanning ${i+1}/${courses.length}...`;
      if (status) status.textContent = c.courseName;
      if (document.getElementById(PANEL_ID)) _showProgress(i+1, courses.length, c.courseName);
      await setProgress({ running:true, current:i+1, total:courses.length, currentCourse:c.courseName, summary:null });

      const annRes = await fetchAndParse(c.infoUrl,       parseAnnouncements, c.courseName, c.courseId);
      const outRes = await fetchAndParse(c.outlineUrl,    parseOutlines,      c.courseName, c.courseId);
      const matRes = await fetchAndParse(c.materialUrl,   parseMaterials,     c.courseName, c.courseId);
      const subRes = await fetchAndParse(c.submissionUrl, parseSubmissions,   c.courseName, c.courseId);
      const grdRes = await fetchAndParse(c.gradeUrl,      parseGrades,        c.courseName, c.courseId);

      const fetchStatus = {
        announcements: annRes.ok,
        outlines:      outRes.ok,
        materials:     matRes.ok,
        submissions:   subRes.ok,
        grades:        grdRes.ok,
      };

      const courseFailedRequests = Object.values(fetchStatus).filter(ok => !ok).length;
      if (courseFailedRequests > 0) {
        failedRequests += courseFailedRequests;
        failedCourses += 1;
      }

      await new Promise(res =>
        chrome.runtime.sendMessage({
          action: "SAVE_UPDATES",
          payload: {
            courseName: c.courseName,
            courseId: c.courseId,
            announcements: annRes.items,
            outlines:      outRes.items,
            materials:     matRes.items,
            submissions:   subRes.items,
            grades:        grdRes.items,
            fetchStatus,
          }
        }, res)
      );

      const r = {
        courseName:     c.courseName,
        announcements:  annRes.items.length,
        outlines:       outRes.items.length,
        materials:      matRes.items.length,
        submissions:    subRes.items.length,
        grades:         grdRes.items.length,
        failedTabs:     courseFailedRequests,
      };
      summary.push(r);
      scannedIds.push(c.courseId);
      await sleep(100);
    }

    await markGlobalScanDone(scannedIds);
    await setProgress({ running:false, current:courses.length, total:courses.length, currentCourse:"", summary });

    if (scanBtn) scanBtn.disabled = false;
    if (label)   label.textContent = "Scan All Courses";

    _lastCourseCount = courses.length;

    syncUnreadCount((unread, total) => {
      if (total > 0) document.getElementById("hz-view-updates-btn").style.display = "inline-flex";
      if (unread > 0) openPanel();
    });

    if (status) {
      status.textContent = failedRequests > 0
        ? `Scan completed with ${failedRequests} failed request${failedRequests!==1?"s":""} across ${failedCourses} course${failedCourses!==1?"s":""}. Previous data was kept for failed tabs.`
        : "";
    }
  }

  function _showProgress(current, total, courseName) {
    const body = document.getElementById("hz-panel-body");
    if (!body) return;
    const pct = total > 0 ? Math.round((current/total)*100) : 0;
    body.innerHTML = `<div class="hz-prog">
      <div class="hz-prog-title">Scanning All Courses-</div>
      <div class="hz-prog-bg"><div class="hz-prog-bar" style="width:${pct}%"></div></div>
      <div class="hz-prog-course">${esc(courseName||"Initializing-")}</div>
      <div class="hz-prog-count">${current} / ${total} courses</div>
    </div>`;
  }

  function markGlobalScanDone(ids) {
    return new Promise(r => {
      chrome.storage.local.get("hz_scanned_courses_session", res => {
        const rec = res.hz_scanned_courses_session || { ids:[], names:{} };
        if (!rec.names) rec.names = {};
        // Store canonical course names (from dashboard cards) keyed by courseId
        // so courseProxy can look them up and avoid using extracted names from fetched HTML
        collectCourseLinks().forEach(c => {
          if (!rec.names[c.courseId]) rec.names[c.courseId] = c.courseName;
        });
        ids.forEach(id => { if(!rec.ids.includes(id)) rec.ids.push(id); });
        rec.globalScanDone = true;
        chrome.storage.local.set({ hz_scanned_courses_session: rec }, r);
      });
    });
  }

  function failedFetchResult(error, status) {
    return { ok:false, error, status:status||0, items:[] };
  }

  function successfulFetchResult(items) {
    return { ok:true, error:null, status:200, items:Array.isArray(items)?items:[] };
  }

  function looksLikeAuthPage(finalUrl, html) {
    const url = String(finalUrl || "").toLowerCase();
    const body = String(html || "").toLowerCase();
    return url.includes("/web/login") ||
      body.includes('name="login"') ||
      body.includes('action="/web/login"') ||
      body.includes('id="login"') ||
      body.includes('name="password"');
  }

  async function fetchAndParse(url, parseFn, courseName, courseId) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const resp = await fetch(url, { credentials:"include", cache:"no-store", signal:ctrl.signal });
      if (!resp.ok) return failedFetchResult(`http_${resp.status}`, resp.status);
      const html = await resp.text();
      if (looksLikeAuthPage(resp.url || url, html)) return failedFetchResult("auth", resp.status || 200);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const items = parseFn(doc, courseName, courseId);
      return successfulFetchResult(items);
    } catch (err) {
      if (err && err.name === "AbortError") return failedFetchResult("timeout", 0);
      return failedFetchResult("network", 0);
    } finally {
      clearTimeout(timer);
    }
  }

  // -- Panel open / close ----------------------------------------------------
  // -- Toggle arrow button (persists on page, indicates panel state) ---------
  function _ensureToggleArrow() {
    if (document.getElementById("hz-toggle-arrow")) return;
    const btn = document.createElement("button");
    btn.id = "hz-toggle-arrow";
    btn.className = "hz-panel-toggle-arrow";
    btn.title = "Toggle Course Updates";
    btn.innerHTML = `<svg id="hz-arrow-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    btn.addEventListener("click", togglePanel);
    document.body.appendChild(btn);
  }
  function _updateToggleArrow(panelOpen) {
  const btn  = document.getElementById("hz-toggle-arrow");
  const icon = document.getElementById("hz-arrow-icon");
  if (!btn || !icon) return;

  const panel = document.getElementById(PANEL_ID);
  const width = panel?.offsetWidth || 380;

  if (panelOpen) {
    btn.style.right = `${width}px`;
    icon.style.transform = "rotate(180deg)";
  } else {
    btn.style.right = "0";
    icon.style.transform = "rotate(0deg)";
  }
}

  function togglePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.remove();
      _updateToggleArrow(false);
      return;
    }
    openPanel();
  }

  async function openPanel() {
    document.getElementById(PANEL_ID)?.remove();
    _ensureToggleArrow();
    const data  = await getAllStored();
    const panel = buildPanel(data);
    document.body.appendChild(panel);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      panel.style.transform = "translateX(0)";
      _updateToggleArrow(true);
    }));
  }

  // -- Build panel -----------------------------------------------------------
  function buildPanel(data) {
    _panelShowAll = false;
    const rd = data.readIds || {};

    // -- Build courseMap with name normalization --------------------------
    // Items from different scan sources may store slightly different course
    // names (e.g. "Advance Web Programming" vs "Advance Web Programming 8").
    // We group by normalised key and keep the canonical (shortest clean) name.
    const courseMap  = {};  // normKey ? { displayName, ann, out, mat, sub, grd }
    const nameClean  = s => String(s)
      .replace(/\(.*?\)/g,"")   // strip (N) suffix
      .replace(/\s+\d+$/,"")    // strip trailing bare numbers
      .replace(/\s+/g," ")
      .trim();
    const addItems = (type, arr) => arr.forEach(item => {
      const raw  = (item.courseName || "Unknown").trim();
      const key  = normName(nameClean(raw));
      if (!courseMap[key]) {
        courseMap[key] = { displayName: nameClean(raw), ann:[], out:[], mat:[], sub:[], grd:[] };
      } else {
        // Keep shortest clean name as canonical display name
        const existing = courseMap[key].displayName;
        const candidate = nameClean(raw);
        if (candidate.length < existing.length) courseMap[key].displayName = candidate;
      }
      courseMap[key][type].push(item);
    });
    addItems("ann",data.ann); addItems("out",data.out); addItems("mat",data.mat);
    addItems("sub",data.sub); addItems("grd",data.grd);

    // Build sorted list using display names
    const courseNames = Object.values(courseMap)
      .map(v => v.displayName)
      .sort((a,b)=>a.localeCompare(b));
    // Rebuild courseMap keyed by displayName for downstream code
    const displayMap = {};
    Object.values(courseMap).forEach(v => { displayMap[v.displayName] = v; });
    // Replace courseMap reference for renderCourseList and attachItemListeners
    Object.keys(courseMap).forEach(k => delete courseMap[k]);
    Object.entries(displayMap).forEach(([k,v]) => { courseMap[k] = v; });
    const allItems    = [...data.ann,...data.mat,...data.sub,...data.grd,...data.out];
    const total       = allItems.length;
    const unread      = allItems.filter(i=>!rd[i.id]).length;
    _unreadCount      = unread;

    const tabU = {
      all:unread,
      ann:data.ann.filter(i=>!rd[i.id]).length,
      out:data.out.filter(i=>!rd[i.id]).length,
      mat:data.mat.filter(i=>!rd[i.id]).length,
      sub:data.sub.filter(i=>!rd[i.id]).length,
      grd:data.grd.filter(i=>!rd[i.id]).length,
    };

    const subHTML = unread > 0
      ? `<span class="hz-unread-pill">${unread} unread</span><span class="hz-total-text"> - ${total} total</span>`
      : `<span class="hz-all-read-text">All ${total} item${total!==1?"s":""} read</span>`;

    const TABS = [
      {key:"all",label:"All",    u:tabU.all},
      {key:"ann",label:"Announcement",   u:tabU.ann},
      {key:"mat",label:"Material",u:tabU.mat},
      {key:"sub",label:"Submission",u:tabU.sub},
      {key:"grd",label:"Grade",  u:tabU.grd},
      {key:"out",label:"Outline",u:tabU.out},
    ];

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="hz-ph">
        <div class="hz-ph-row1">
          <span class="hz-ph-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Course Updates
          </span>
          <div class="hz-ph-actions">
            <button class="hz-abtn" id="hz-panel-toggle">Show All</button>
            <button class="hz-abtn" id="hz-panel-markall">All read</button>
            <button class="hz-ibtn" id="hz-panel-refresh" title="Refresh">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
            <button class="hz-ibtn" id="hz-panel-close" title="Close">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div id="hz-panel-subtitle">${subHTML}</div>
      </div>

      <div class="hz-tabs">
        ${TABS.map((t,i)=>`
          <button class="hz-tab${i===0?" active":""}" data-filter="${t.key}">
            <span>${t.label}</span>
            <span class="hz-tab-cnt${t.u===0?" zero":""}">${t.u}</span>
          </button>`).join("")}
      </div>

      <div id="hz-panel-body">
        ${courseNames.length ? renderCourseList(courseMap, courseNames, "all", rd) : emptyState()}
      </div>

      <div class="hz-footer">
        <a href="#" id="hz-panel-clear">Clear all updates</a>
        <button class="hz-footer-close" id="hz-panel-footer-close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Close
        </button>
      </div>
    `;

    // Tab filter
    panel.querySelectorAll(".hz-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".hz-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const body = document.getElementById("hz-panel-body");
        if (body) body.innerHTML = courseNames.length
          ? renderCourseList(courseMap, courseNames, btn.dataset.filter, rd)
          : emptyState();
        attachItemListeners(panel, rd, courseMap);
      });
    });

    // Show All / Unread Only toggle
    panel.querySelector("#hz-panel-toggle").addEventListener("click", () => {
      _panelShowAll = !_panelShowAll;
      panel.querySelector("#hz-panel-toggle").textContent = _panelShowAll ? "Unread Only" : "Show All";
      const f = panel.querySelector(".hz-tab.active")?.dataset.filter || "all";
      const body = document.getElementById("hz-panel-body");
      if (body) body.innerHTML = renderCourseList(courseMap, courseNames, f, rd);
      attachItemListeners(panel, rd, courseMap);
    });

    // Mark all read
    panel.querySelector("#hz-panel-markall").addEventListener("click", () => {
      allItems.forEach(i => { rd[i.id] = true; });
      markReadIds(allItems.map(i => i.id));
      // Immediately update subtitle and tab badges
      const sub = document.getElementById("hz-panel-subtitle");
      if (sub) sub.innerHTML = `<span class="hz-all-read-text">All ${total} item${total!==1?"s":""} read</span>`;
      panel.querySelectorAll(".hz-tab-cnt").forEach(b => { b.textContent="0"; b.classList.add("zero"); });
      // Re-render body
      const f = panel.querySelector(".hz-tab.active")?.dataset.filter || "all";
      const body = document.getElementById("hz-panel-body");
      if (body) body.innerHTML = renderCourseList(courseMap, courseNames, f, rd);
      attachItemListeners(panel, rd, courseMap);
    });

    panel.querySelector("#hz-panel-refresh").addEventListener("click", async () => {
      const fresh = await getAllStored();
      const newP  = buildPanel(fresh);
      panel.replaceWith(newP);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        newP.style.transform = "translateX(0)";
        _updateToggleArrow(true);
        // Re-attach footer close on refreshed panel
        newP.querySelector("#hz-panel-footer-close")?.addEventListener("click", () => {
          newP.remove(); _updateToggleArrow(false);
        });
        newP.querySelector("#hz-panel-close")?.addEventListener("click", () => {
          newP.remove(); _updateToggleArrow(false);
        });
      }));
    });
    panel.querySelector("#hz-panel-close").addEventListener("click", () => {
      panel.remove();
      _updateToggleArrow(false);
    });
    panel.querySelector("#hz-panel-footer-close")?.addEventListener("click", () => {
      panel.remove();
      _updateToggleArrow(false);
    });
    panel.querySelector("#hz-panel-clear").addEventListener("click", e => {
      e.preventDefault();
      chrome.runtime.sendMessage({ action:"CLEAR_UPDATES" }, () => {
        panel.remove();
        _unreadCount = 0;
        const badge = document.getElementById("hz-update-badge");
        if (badge) badge.textContent = "";
        const viewBtn = document.getElementById("hz-view-updates-btn");
        if (viewBtn) viewBtn.style.display = "none";
        // Remove all course card badges immediately
        document.querySelectorAll(".hz-card-badge").forEach(b => b.remove());
      });
    });

    attachItemListeners(panel, rd, courseMap);
    return panel;
  }

  // -- Render course list ----------------------------------------------------
  function renderCourseList(courseMap, courseNames, filter, rd) {
    const rows = courseNames.map(name => {
      const d = courseMap[name];
      let allItems = [];
      if (filter==="all"||filter==="ann") allItems=allItems.concat(d.ann.map(x=>({type:"ann",x})));
      if (filter==="all"||filter==="mat") allItems=allItems.concat(d.mat.map(x=>({type:"mat",x})));
      if (filter==="all"||filter==="sub") allItems=allItems.concat(d.sub.map(x=>({type:"sub",x})));
      if (filter==="all"||filter==="grd") allItems=allItems.concat(d.grd.map(x=>({type:"grd",x})));
      if (filter==="all"||filter==="out") allItems=allItems.concat(d.out.map(x=>({type:"out",x})));

      // Sort: newest scannedAt first; among same timestamp, unread before read
      allItems.sort((a,b)=>{
        const dateDiff = new Date(b.x.scannedAt||0) - new Date(a.x.scannedAt||0);
        if (dateDiff !== 0) return dateDiff;
        const ar=!!rd[a.x.id], br=!!rd[b.x.id];
        return ar===br ? 0 : ar ? 1 : -1;
      });
      const visible    = _panelShowAll ? allItems : allItems.filter(({x})=>!rd[x.id]);
      if (!visible.length) return "";

      const unreadCount = allItems.filter(({x})=>!rd[x.id]).length;
      const allRead     = unreadCount===0;

      const typeBadge = (key, arr, label, activeBg, activeColor) => {
        if (!arr.length || (filter!=="all" && filter!==key)) return "";
        const u = arr.filter(x=>!rd[x.id]).length;
        const active = u > 0;
        return `<span class="hz-tbadge" style="background:${active?activeBg:"#f1f5f9"};color:${active?activeColor:"#94a3b8"};">${active?u+" unread ":""}${arr.length} ${label}</span>`;
      };

      const badges = [
        typeBadge("ann",d.ann,"Ann","#fef3c7","#92400e"),
        typeBadge("mat",d.mat,"Mat","#dbeafe","#1e40af"),
        typeBadge("sub",d.sub,"Sub","#dcfce7","#15803d"),
        typeBadge("grd",d.grd,"Grd","#f3e8ff","#6b21a8"),
        typeBadge("out",d.out,"Out","#e0f2fe","#075985"),
      ].filter(Boolean).join("");

      
      const cid = "hz-c-" + (function(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
})(name);
      return `
        <div class="hz-cs${allRead?" all-read":""}">
          <button class="hz-ctoggle" data-target="${cid}" data-course="${esc(name)}">
            <div style="flex:1;min-width:0;">
              <div class="hz-cname">
                ${unreadCount>0?`<span class="hz-cdot"></span>`:""}
                <span class="hz-cname-text">${esc(name)}</span>
              </div>
              <div class="hz-badge-row">${badges}</div>
            </div>
            <i class="hz-chev">&#8250;</i>
          </button>
          <div class="hz-citems" id="${cid}">
            ${visible.map(({type,x})=>renderItem(type,x,rd)).join("")}
          </div>
        </div>`;
    }).filter(Boolean);

    return rows.length ? rows.join("") : emptyState();
  }

  // -- Render single item ----------------------------------------------------
  function renderItem(type, x, rd) {
    const isRead  = !!rd[x.id];
    const dimCls  = (isRead && !_panelShowAll) ? " dim" : "";
    
    const colors  = {ann:"#ffc107",out:"#0891b2",mat:"#0d6efd",sub:"#198754",grd:"#6f42c1"};
    const labels  = {ann:"Announcement",out:"Outline",mat:"Material",sub:"Submission",grd:"Grade"};
    // SVG icons - no emojis
    const icons   = {
      ann: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
      out: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>',
      mat: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      sub: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      grd: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    };

    let title="", meta="", extra="";

    if (type==="ann") {
      title = x.subject||"";
      meta  = x.date?`Date: ${x.date}`:"";
      if (x.description||x.attachmentLink) {
        const iid = "hz-d-"+Math.random().toString(36).slice(2,9);
        extra = `
          <button class="hz-dbtn" data-iid="${iid}" data-itemid="${esc(x.id)}">View Details</button>
          <div class="hz-dbox" id="${iid}">
            ${x.description?`<div class="hz-dtext">${esc(x.description)}</div>`:""}
            ${(() => { const safeHref = safePortalUrl(x.attachmentLink, ["/student/", "/web/"]); return safeHref ? `<a class="hz-attlink" href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">View Attachment</a>` : ""; })()}
          </div>`;
      }
    } else if (type==="out") {
      title = x.title||x.fileName||"";
      meta  = x.weekNo ? `Week ${x.weekNo}` : "";
      if (x.description) {
        meta = meta ? `${meta} - ${x.description.slice(0,70)}` : x.description.slice(0,70);
      }
      const safeOutlineDownload = safePortalUrl(x.downloadLink, ["/student/", "/web/", "/download", "/breakdown/"]);
      if (safeOutlineDownload) {
        extra=`<a class="hz-dlbtn" href="${esc(safeOutlineDownload)}" target="_blank" rel="noopener noreferrer" download data-itemid="${esc(x.id)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download</a>`;
      }
    } else if (type==="mat") {
      title = x.fileName||"";
      meta  = x.description?x.description.slice(0,70):"";
      const safeOutlineDownload = safePortalUrl(x.downloadLink, ["/student/", "/web/", "/download", "/breakdown/"]);
      if (safeOutlineDownload) {
        extra=`<a class="hz-dlbtn" href="${esc(safeOutlineDownload)}" target="_blank" rel="noopener noreferrer" download data-itemid="${esc(x.id)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download</a>`;
      }
    } else if (type==="sub") {
      title = x.name||"";
      meta  = x.startDate&&x.dueDate?`Dates: ${x.startDate} -> ${x.dueDate}`:x.dueDate?`Due: ${x.dueDate}`:"";
    } else if (type==="grd") {
      title = x.assessment||"";
      meta  = x.previousPct!=null?`${x.previousPct}% -> ${x.percentage}%`:x.percentageDisplay?`Obtained: ${x.percentageDisplay}`:"";
    }

    // Build navigation URL for sub/grd double-click
    const tabPaths = { ann:"info", out:"outline", mat:"material", sub:"submission", grd:"gradebook" };
    const navUrl = x.courseId
      ? `${window.location.origin}/student/course/${tabPaths[type]}/${x.courseId}`
      : "";
    const navTitle = (type==="sub"||type==="grd") ? ' title="Click to mark read | Double-click to open tab"' : "";

    return `<div class="hz-item${dimCls}" style="border-left-color:${colors[type]};"
        data-item-id="${esc(x.id)}" data-type="${type}" data-nav-url="${esc(navUrl)}"${navTitle}>
      <div class="hz-itype">${!isRead?`<span class="hz-udot"></span>`:""}${icons[type]}&nbsp;${labels[type]}</div>
      <div class="hz-ititle">${esc(title)||"-"}</div>
      ${meta?`<div class="hz-imeta">${esc(meta)}</div>`:""}
      ${extra}
    </div>`;
  }

  function emptyState() {
    const emptyIcon = _panelShowAll
      ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#adb5bd" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#adb5bd" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    return `<div class="hz-empty">
      <div class="hz-empty-icon">${emptyIcon}</div>
      <div class="hz-empty-title">${_panelShowAll?"No updates yet":"All caught up!"}</div>
      <div class="hz-empty-sub">${_panelShowAll
        ?"Click Scan All Courses to collect updates"
        :"All items are read. Click 'Show All' to see them."}</div>
    </div>`;
  }

  // -- Attach event listeners ------------------------------------------------
  function attachItemListeners(panel, rd, courseMap) {
    // Course accordion
    panel.querySelectorAll(".hz-ctoggle").forEach(btn => {
      btn.onclick = () => {
        const target   = document.getElementById(btn.dataset.target);
        const chev     = btn.querySelector(".hz-chev");
        if (!target) return;
        const opening  = target.style.display==="none" || !target.style.display;
        target.style.display = opening?"block":"none";
        if (chev) chev.style.transform = opening?"rotate(90deg)":"";

        if (!opening && !_panelShowAll) {
          // Section closing - dim all items that are now read
          target.querySelectorAll(".hz-item").forEach(el => {
            const id = el.dataset.itemId;
            if (id && rd[id]) el.classList.add("dim");
          });
        }

        // Opening a course section does NOT auto-mark items as read.
        // Read state is only set by explicit user actions:
        //   - Announcement: clicking "View Details"
        //   - Material: clicking the Download button
        //   - All: clicking "All read" in the panel header
        // (No code needed here - just expand to show items)
      };
    });

    // Material/outline download click ? mark as read
    panel.querySelectorAll(".hz-dlbtn[data-itemid]").forEach(a => {
      a.addEventListener("click", () => {
        const id = a.dataset.itemid;
        if (!id || rd[id]) return;
        rd[id] = true;
        markReadIds([id]);
        const itemEl = a.closest(".hz-item");
        if (itemEl) {
          itemEl.querySelector(".hz-udot")?.remove();
          // Dim on collapse - keep full opacity while visible
        }
      });
    });

    // Item interactions by type:
    //   Material/Outline ? Download button marks read (handled above); clicking card also marks read
    //   Submission/Grade ? single click = mark read; double click = open course tab
    panel.querySelectorAll(".hz-item[data-item-id]").forEach(el => {
      const type = el.dataset.type || "";
      const isOut = type === "out";
      const isMat = type === "mat";
      const isSub = type === "sub";
      const isGrd = type === "grd";
      if (!isOut && !isMat && !isSub && !isGrd) return; // ann handled by View Details btn

      // Single-click: mark as read
      el.addEventListener("click", (e) => {
        if ((isOut || isMat) && e.target.closest(".hz-dlbtn")) return; // download btn handled separately
        const id = el.dataset.itemId;
        if (!id || rd[id]) return;
        rd[id] = true;
        markReadIds([id]);
        el.querySelector(".hz-udot")?.remove();
        if (!_panelShowAll) {
          setTimeout(() => { el.classList.add("dim"); }, 400);
        }
      });

      // Double-click: navigate to that course tab in a new tab
      if ((isSub || isGrd) && el.dataset.navUrl) {
        el.style.cursor = "pointer";
        el.addEventListener("dblclick", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const url = el.dataset.navUrl;
          safeWindowOpen(url, ["/student/course/"]);
        });
      }
    });

    // Announcement detail toggle
    panel.querySelectorAll(".hz-dbtn").forEach(btn => {
  btn.onclick = () => {
    const box     = document.getElementById(btn.dataset.iid);
    if (!box) return;
    const opening = box.style.display==="none" || !box.style.display;
    box.style.display = opening ? "block" : "none";
    btn.textContent   = opening ? "Hide" : "View Details";
    btn.classList.toggle("open", opening);

    const id = btn.dataset.itemid;
    if (!id) return;

    if (opening && !rd[id]) {
      rd[id] = true;
      markReadIds([id]);
      btn.closest(".hz-item")?.querySelector(".hz-udot")?.remove();
    }

    if (opening) {
      // Always remove dim while detail box is open (covers already-read items too)
      btn.closest(".hz-item")?.classList.remove("dim");
    }

    if (!opening && rd[id] && !_panelShowAll) {
      // Re-dim only when user closes
      btn.closest(".hz-item")?.classList.add("dim");
    }
  };
});
  }

  // -- Storage helpers -------------------------------------------------------
  function getAllStored() {
    return new Promise(r => {
      chrome.storage.local.get(
        ["hz_announcements","hz_outlines","hz_materials","hz_submissions","hz_grades","hz_read_ids"],
        res => r({
          ann:res.hz_announcements||[], out:res.hz_outlines||[], mat:res.hz_materials||[],
          sub:res.hz_submissions  ||[], grd:res.hz_grades   ||[],
          readIds:res.hz_read_ids ||{},
        })
      );
    });
  }
  function storageGet(k){ return new Promise(r=>chrome.storage.local.get(k,res=>r(res[k]||null))); }
  function storageSet(k,v){ return new Promise(r=>chrome.storage.local.set({[k]:v},r)); }
  function setProgress(d){ return storageSet("hz_scan_all_progress",d); }

  // -- Parsers ---------------------------------------------------------------
  // -- Stable ID: content-based, NOT including courseName ---------------
  // Ensures same item gets same ID regardless of scan source or name variation.
  function makeId(prefix, ...parts) {
    const s = parts.join("||"); let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31,h) + s.charCodeAt(i))|0;
    return prefix + "_" + Math.abs(h).toString(36);
  }

  // All parsers return item arrays - NO direct storage writes.
  // The caller (startScanAll/scanTab) sends a single SAVE_UPDATES per course.

  function parseAnnouncements(doc, cn, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h.includes("subject"))) continue;
      const is=ths.findIndex(h=>h.includes("subject")), id2=ths.findIndex(h=>h.includes("date")),
            idc=ths.findIndex(h=>h.includes("desc")), ia=ths.findIndex(h=>h.includes("attach"));
      tbl.querySelectorAll("tbody tr").forEach(row => {
        const td = row.querySelectorAll("td"); if (td.length<3) return;
        const subj = td[is>=0?is:1]?.textContent.trim()||"";
        const date = td[id2>=0?id2:2]?.textContent.trim()||"";
        const desc = td[idc>=0?idc:3]?.textContent.trim()||"";
        const att  = (ia>=0&&td[ia]) ? td[ia].querySelector("a[href]")?.href||null : null;
        if (!subj||subj.length<2) return;
        items.push({ id:makeId("ann",cn,subj,date), courseName:cn, courseId:courseId||"", tabLabel:"Course News",
          subject:subj, date, description:desc.substring(0,300), attachmentLink:att,
          scannedAt:new Date().toISOString() });
      });
    }
    return items;
  }

  function parseMaterials(doc, cn, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h.includes("material")||h.includes("file"))) continue;
      const ifl=ths.findIndex(h=>h.includes("material")||h.includes("file")),
            idc=ths.findIndex(h=>h.includes("desc")), idl=ths.findIndex(h=>h.includes("download"));
      tbl.querySelectorAll("tbody tr").forEach(row => {
        const td = row.querySelectorAll("td"); if (td.length<2) return;
        const fn = td[ifl>=0?ifl:1]?.textContent.trim()||"";
        const dc = td[idc>=0?idc:2]?.textContent.trim()||"";
        let dl   = (idl>=0&&td[idl]) ? td[idl].querySelector("a[href]")?.href||null : null;
        if (!dl) dl = row.querySelector("a[href*='/material/download/'],a[href*='/download/']")?.href||null;
        if (!fn||fn.length<2) return;
        items.push({ id:makeId("mat",cn,fn,dl||dc), courseName:cn, courseId:courseId||"", tabLabel:"Course Material",
          fileName:fn, description:dc, downloadLink:dl, scannedAt:new Date().toISOString() });
      });
    }
    return items;
  }

  function parseOutlines(doc, cn, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h.includes("week")) || !ths.some(h=>h.includes("download"))) continue;
      const iWeek = ths.findIndex(h=>h.includes("week"));
      const iBody = ths.findIndex(h=>h.includes("content"));
      const iFiles = ths.findIndex(h=>h.includes("files"));
      tbl.querySelectorAll("tbody tr").forEach(row => {
        const td = row.querySelectorAll("td");
        const link = row.querySelector("a[href*='/student/breakdown/download/'],a[href*='/breakdown/download/']");
        if (!td.length || !link) return;
        const weekNo = td[iWeek>=0?iWeek:0]?.textContent.trim()||"";
        const body   = td[iBody>=0?iBody:1]?.textContent.replace(/\s+/g," ").trim()||"";
        const files  = td[iFiles>=0?iFiles:3]?.textContent.replace(/\s+/g," ").trim()||"";
        const downloadLink = link.href||"";
        if (!downloadLink) return;
        const title = weekNo ? `Week ${weekNo}` : "Course Outline";
        items.push({ id:makeId("out",cn,weekNo,downloadLink), courseName:cn, courseId:courseId||"", tabLabel:"Course Outline",
          title, weekNo, description:body.substring(0,300), fileName:files||title, downloadLink,
          scannedAt:new Date().toISOString() });
      });
    }
    return items;
  }

  function parseSubmissions(doc, cn, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h==="name")||!ths.some(h=>h.includes("due"))) continue;
      let rows = Array.from(tbl.querySelectorAll("tbody tr[submission_id]"));
      if (!rows.length) rows = Array.from(tbl.querySelectorAll("tbody tr")).filter(r=>r.querySelectorAll("td").length>=4);
      rows.forEach(row => {
        const nt=row.querySelector("td.rec_submission_title"), st=row.querySelector("td.rec_submission_date"),
              dt=row.querySelector("td.rec_submission_due_date"), td=row.querySelectorAll("td");
        const name = (nt||td[1])?.textContent.trim()||"";
        const sd   = (st||td[3])?.textContent.trim()||"";
        const dd   = (dt||td[4])?.textContent.trim()||"";
        const si   = row.getAttribute("submission_id")||"";
        if (!name||name.length<2) return;
        items.push({ id:makeId("sub",cn,si||name,sd), courseName:cn, courseId:courseId||"", tabLabel:"Course Submission",
          name, startDate:sd, dueDate:dd, scannedAt:new Date().toISOString() });
      });
    }
    return items;
  }

  function parseGrades(doc, cn, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h.includes("assessment"))) continue;
      const it=ths.findIndex(h=>h.includes("assessment")),
            ip=ths.findIndex(h=>h.includes("percentage")||h.includes("obtained")||h.includes("marks"));
      tbl.querySelectorAll("tbody tr").forEach(row => {
        const td = row.querySelectorAll("td"); if (td.length<1) return;
        const as = td[it>=0?it:0]?.textContent.trim()||"";
        const rp = td[ip>=0?ip:1]?.textContent.trim()||"";
        if (!as||as.length<2) return;
        const n = parseFloat(rp.replace(/[^\d.]/g,""));
        items.push({ id:makeId("grd",cn,as), courseName:cn, courseId:courseId||"", tabLabel:"Course Grade Book",
          assessment:as, percentage:isNaN(n)?null:n, percentageDisplay:rp||"-",
          scannedAt:new Date().toISOString() });
      });
    }
    return items;
  }

  function dedupe(arr,key){const s=new Set();return arr.filter(i=>{if(s.has(i[key]))return false;s.add(i[key]);return true;});}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  function safePortalUrl(raw, prefixes) {
    try {
      if (!raw) return "";
      const u = new URL(raw, window.location.origin);
      if (u.origin !== window.location.origin) return "";
      if (prefixes && prefixes.length && !prefixes.some(p => u.pathname.startsWith(p))) return "";
      return u.href;
    } catch {
      return "";
    }
  }
  function safeWindowOpen(raw, prefixes) {
    const safeUrl = safePortalUrl(raw, prefixes);
    if (safeUrl) window.open(safeUrl, "_blank", "noopener,noreferrer");
  }
  function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

  // -- Boot ------------------------------------------------------------------
  // -- Course card badges + hover tooltip + click-to-filter -----------------
  //
  // Design goals:
  //   - Badge sits inside .card-header right-aligned - truly inside the card
  //   - Count = total UNREAD items for that course (same source as panel)
  //   - Card glow when unread items exist
  //   - Hover tooltip shows latest 2 unread titles
  //   - Click card (when unread > 0) ? open panel filtered to that course
  //   - All values stay consistent with View Updates badge and panel header

  function injectCardBadges() {
    chrome.storage.local.get(
      ["hz_announcements","hz_outlines","hz_materials","hz_submissions","hz_grades","hz_read_ids"],
      res => {
        const rd = res.hz_read_ids || {};

        // -- Build per-course unread count and preview lists -------------
        const courseData = {};  // courseName (raw) ? { count, previews:[] }

        const nameClean = s => String(s)
          .replace(/\(.*?\)/g,"")
          .replace(/\s+\d+$/,"")
          .replace(/\s+/g," ")
          .trim();

        const process = (arr, labelFn) => {
          arr.forEach(item => {
            const raw = (item.courseName || "").trim();
            if (!raw) return;
            const cn = nameClean(raw); // strip any trailing number artifacts
            if (!cn) return;
            if (!courseData[cn]) courseData[cn] = { count:0, previews:[] };
            if (!rd[item.id]) {
              courseData[cn].count++;
              if (courseData[cn].previews.length < 2) {
                courseData[cn].previews.push(labelFn(item));
              }
            }
          });
        };

        // Sort newest-first per type so previews show latest
        const byDate = arr => [...arr].sort((a,b)=>new Date(b.scannedAt||0)-new Date(a.scannedAt||0));
        process(byDate(res.hz_announcements||[]), i=>"News: "+(i.subject||"Announcement"));
        process(byDate(res.hz_outlines     ||[]), i=>"Outline: "+(i.title||i.fileName||"Outline"));
        process(byDate(res.hz_materials    ||[]), i=>"File: "+(i.fileName||"Material"));
        process(byDate(res.hz_submissions  ||[]), i=>"Task: "+(i.name||"Submission"));
        process(byDate(res.hz_grades       ||[]), i=>"Grade: "+(i.assessment||"Grade"));

        // -- Update each course card -------------------------------------
        document.querySelectorAll('a[href*="/student/course/info/"]').forEach(anchor => {
          // Get course name from the card header span (the actual text node)
          // Select only the course-name span, never the badge span we injected
          const hdrSpan = anchor.querySelector(".card-header span:not(.hz-card-badge)");
          if (!hdrSpan) return;
          const courseName = hdrSpan.textContent.trim();
          const cardHeader = anchor.querySelector(".card-header");
          if (!cardHeader) return;

          const info  = courseData[courseName] || { count:0, previews:[] };
          const count = info.count;

          // -- Badge ---------------------------------------------------
          cardHeader.style.display        = "flex";
          cardHeader.style.alignItems     = "center";
          cardHeader.style.justifyContent = "space-between";
          cardHeader.style.gap            = "8px";
          cardHeader.style.flexWrap       = "nowrap";

          let badge = cardHeader.querySelector(".hz-card-badge");
          if (count > 0) {
            if (!badge) {
              badge = document.createElement("span");
              badge.className = "hz-card-badge";
              cardHeader.appendChild(badge);
            }
            if (badge.textContent !== String(count)) {
              badge.textContent = count;
              // Re-trigger pop animation on update
              badge.style.animation = "none";
              requestAnimationFrame(() => { badge.style.animation = ""; });
            }
          } else if (badge) {
            badge.remove();
          }

          // -- Card glow ------------------------------------------------
          const card = anchor.querySelector(".card");
          if (card) card.classList.toggle("hz-card-glow", count > 0);

          // -- Event listeners (bind once) ------------------------------
          if (!anchor.dataset.hzBound) {
            anchor.dataset.hzBound = "1";

            // Hover: show tooltip
            anchor.addEventListener("mouseenter", _showTooltip);
            anchor.addEventListener("mouseleave",  _hideTooltip);

            // No click intercept - let portal navigate normally.
            // User can open panel via "Updates" button or tooltip.
          }

          // Always refresh preview data (changes after scan)
          if (info.previews.length > 0) {
            anchor.dataset.hzPreview     = info.previews.join("||");
            anchor.dataset.hzCourseName  = courseName;
          } else {
            delete anchor.dataset.hzPreview;
          }
        });
      }
    );
  }

  // -- Tooltip ----------------------------------------------------------------
  let _tooltipEl = null;

  function _showTooltip(e) {
    _hideTooltip();
    const anchor  = e.currentTarget;
    const preview = anchor.dataset.hzPreview;
    if (!preview) return;
    const lines = preview.split("||");
    const cn    = anchor.dataset.hzCourseName || "";

    const tip = document.createElement("div");
    tip.className = "hz-tooltip";
    tip.innerHTML =
      `<div class="hz-tip-course">${esc(cn)}</div>` +
      lines.map(l=>`<div class="hz-tip-line">${esc(l)}</div>`).join("") +
      `<div class="hz-tip-more">Click to view all updates ?</div>`;
    document.body.appendChild(tip);
    _tooltipEl = tip;

    requestAnimationFrame(() => {
      const rect    = anchor.getBoundingClientRect();
      const scrollY = window.scrollY;
      const tipH    = tip.offsetHeight;
      const tipW    = tip.offsetWidth;
      let left = rect.left;
      let top  = rect.top + scrollY - tipH - 8;
      if (left + tipW > window.innerWidth - 12) left = window.innerWidth - tipW - 12;
      if (top < scrollY + 8) top = rect.bottom + scrollY + 8;
      tip.style.left = left + "px";
      tip.style.top  = top  + "px";
    });
  }

  function _hideTooltip() {
    if (_tooltipEl) { _tooltipEl.remove(); _tooltipEl = null; }
  }

  // -- Open panel filtered to a specific course -------------------------------
  async function openPanelFilteredTo(courseName) {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      await openPanel();
      panel = document.getElementById(PANEL_ID);
    }
    if (!panel) return;

    // Small delay to ensure DOM is settled after panel open animation
    setTimeout(() => _filterPanelToCourse(panel, courseName), 80);
  }

  const _nameClean = s => String(s)
    .replace(/\(.*?\)/g,"")
    .replace(/\s+\d+$/,"")
    .replace(/\s+/g," ")
    .trim();

  function _filterPanelToCourse(panel, courseName) {
    const body = document.getElementById("hz-panel-body");
    if (!body) return;

    const targetKey = normName(_nameClean(courseName));

    // Find section whose data-course matches (exact, normalised, or cleaned)
    let found = null;
    panel.querySelectorAll(".hz-ctoggle").forEach(btn => {
      const cn = (btn.dataset.course || "").trim();
      if (!found && (
        cn === courseName ||
        normName(cn) === normName(courseName) ||
        normName(_nameClean(cn)) === targetKey
      )) {
        found = btn;
      }
    });

    if (!found) return;

    // Expand the section if not already open
    const target = document.getElementById(found.dataset.target);
    const chev   = found.querySelector(".hz-chev");
    if (target && (target.style.display === "none" || !target.style.display)) {
      target.style.display = "block";
      if (chev) chev.style.transform = "rotate(90deg)";

      // Trigger mark-read for mat/sub/grd - same logic as accordion click
      const rd = {};
      panel.querySelectorAll('[data-item-id]').forEach(el => {
        // read state already tracked in courseMap inside attachItemListeners
      });
      // Re-use the existing btn click handler
      found.click();
    }

    // Scroll the panel body to this section
    requestAnimationFrame(() => {
      found.scrollIntoView({ behavior:"smooth", block:"start" });
    });
  }

  // Normalise course name for fuzzy matching (lowercase, collapse whitespace)
  function normName(s) {
    return String(s).toLowerCase().replace(/\s+/g," ").trim();
  }

  // Called after every read-state change to keep badges in sync
  function refreshCardBadges() {
    // Debounce slightly so rapid mark-read calls batch together
    if (refreshCardBadges._t) clearTimeout(refreshCardBadges._t);
    refreshCardBadges._t = setTimeout(injectCardBadges, 150);
  }

  // -- Auto scan on login -----------------------------------------------------
  // Uses the portal's session_id cookie to detect new logins.
  // Each distinct session_id = one scan. Same session_id = skip (already scanned).
  // This means: log out ? log back in ? new session_id ? auto-scan runs again.

  // -- Trigger auto-scan for a given sessionId ------------------------------
  function _runAutoScanForSession(sessionId) {
    // Check setting
    chrome.storage.local.get("hz_auto_scan_on_login", res => {
      if (res.hz_auto_scan_on_login === false) return;

      // Don't run if already scanning
      const scanBtn = document.getElementById("hz-scan-all-btn");
      if (scanBtn && scanBtn.disabled) return;

      // Clear course dedup and save session id first
      chrome.storage.local.remove("hz_scanned_courses_session");
      chrome.storage.local.remove("hz_pending_auto_scan");
      chrome.storage.local.set({ hz_last_session_id: sessionId });

      setTimeout(startScanAll, 800);
    });
  }

  function _getCurrentSessionIdFromBackground() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: "GET_CURRENT_SESSION_ID" }, res => {
        if (chrome.runtime.lastError) {
          resolve("");
          return;
        }
        resolve(res?.sessionId || "");
      });
    });
  }

  // -- Check for auto-scan on page load -------------------------------------
  // Covers: direct navigation to dashboard, page refresh
  function _maybeAutoScan() {
    chrome.storage.local.get("hz_auto_scan_on_login", pref => {
      if (pref.hz_auto_scan_on_login === false) return;

      // Check for a pending session set by the background cookie listener
      // (handles case where login happened on a non-dashboard page)
      chrome.storage.local.get("hz_pending_auto_scan", pending => {
        if (pending.hz_pending_auto_scan) {
          _runAutoScanForSession(pending.hz_pending_auto_scan);
          return;
        }

        _getCurrentSessionIdFromBackground().then(currentSessionId => {
          if (!currentSessionId) return;

          chrome.storage.local.get("hz_last_session_id", stored => {
            if (stored.hz_last_session_id === currentSessionId) return;
            _runAutoScanForSession(currentSessionId);
          });
        });
      });
    });
  }

  function boot() {
    if (!isDashboard()) return;
    const tryInject = () => {
      if (document.querySelectorAll('a[href*="/student/course/info/"]').length > 0) {
        injectToolbar();
        _maybeAutoScan();
      } else {
        setTimeout(tryInject, 600);
      }
    };
    setTimeout(tryInject, 1500);
    // Listen for storage changes from other tabs / background so ALL counts stay live
    // syncUnreadCount atomically updates: toolbar badge, panel header, panel tab badges, card badges
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const relevant = changes.hz_read_ids || changes.hz_announcements ||
                       changes.hz_outlines || changes.hz_materials || changes.hz_submissions || changes.hz_grades;
      if (relevant) {
        // Debounce: multiple storage writes (e.g. bulk mark-read) batch into one sync
        if (_syncDebounce) clearTimeout(_syncDebounce);
        _syncDebounce = setTimeout(syncUnreadCount, 100);
      }
    });
    chrome.runtime.onMessage.addListener((msg,_s,send) => {
      if (msg.action === "INITIATE_SCAN_ALL") {
        send({ courses:collectCourseLinks().length });
        startScanAll();
        return true;
      }
      // Background detected new login via cookie change ? trigger auto-scan
      if (msg.action === "TRIGGER_AUTO_SCAN" && msg.sessionId) {
        _runAutoScanForSession(msg.sessionId);
        send({ ok: true });
        return true;
      }
    });
  }

  boot();
})();



