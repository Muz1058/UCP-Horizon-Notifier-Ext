// content/courseTabBadges.js — v17
// Injects unread count badges on the horizontal tab navigation inside
// each course page (Course News, Course Material, Submission, Grade Book).
// Reads from storage — no scanning, no side effects.

(function () {
  "use strict";

  // Map tab URL segment → storage key + item identifier
  const TAB_MAP = {
    "announcement": { key: "hz_announcements", type: "ann" },
    "outline":      { key: "hz_outlines",      type: "out" },
    "material":     { key: "hz_materials",     type: "mat" },
    "submission":   { key: "hz_submissions",   type: "sub" },
    "grade":        { key: "hz_grades",        type: "grd" },
  };

  // Map tab link href patterns to types
  const HREF_TYPE = {
    "/course/info/":       "announcement",
    "/course/outline/":    "outline",
    "/course/material/":   "material",
    "/course/submission/": "submission",
    "/course/gradebook/":  "grade",
  };

  function getTypeFromHref(href) {
    for (const [pattern, type] of Object.entries(HREF_TYPE)) {
      if (href.includes(pattern)) return type;
    }
    return null;
  }

  // ── Inject badges on the tab bar ──────────────────────────────────────────
  function injectTabBadges() {
    chrome.storage.local.get(
      ["hz_announcements","hz_outlines","hz_materials","hz_submissions","hz_grades","hz_read_ids"],
      res => {
        const rd = res.hz_read_ids || {};

        // Get current course name from the page
        const courseName = getCurrentCourseName();

        // Build unread counts per type for this course only
        const unreadByType = {
          announcement: countUnread(res.hz_announcements || [], rd, courseName),
          outline:      countUnread(res.hz_outlines      || [], rd, courseName),
          material:     countUnread(res.hz_materials     || [], rd, courseName),
          submission:   countUnread(res.hz_submissions   || [], rd, courseName),
          grade:        countUnread(res.hz_grades        || [], rd, courseName),
        };

        // Find the tab nav — ul.uk-tab with course navigation links
        const tabNav = document.querySelector("ul.uk-tab");
        if (!tabNav) return;

        tabNav.querySelectorAll("li a[href]").forEach(a => {
          const href = a.getAttribute("href") || "";
          const type = getTypeFromHref(href);
          if (!type) return;

          const count = unreadByType[type] || 0;

          // Get or create badge
          let badge = a.querySelector(".hz-tab-unread");
          if (count > 0) {
            if (!badge) {
              badge = document.createElement("span");
              badge.className = "hz-tab-unread";
              a.appendChild(badge);
            }
            badge.textContent = count;
          } else if (badge) {
            badge.remove();
          }
        });
      }
    );
  }

  function countUnread(items, rd, courseName) {
    const clean = s => String(s).replace(/\(.*?\)/g,"").replace(/\s+\d+$/,"").replace(/\s+/g," ").trim();
    const cn = clean(courseName).toLowerCase();
    return items.filter(item => {
      if (rd[item.id]) return false;
      const itemCn = clean(item.courseName||"").toLowerCase();
      return itemCn === cn || itemCn.includes(cn) || cn.includes(itemCn);
    }).length;
  }

  function getCurrentCourseName() {
    if (window.HZUtils) return window.HZUtils.getCourseName();
    // Fallback
    const crumbs = document.querySelectorAll("#breadcrumbs li");
    if (crumbs.length >= 2) {
      const a = crumbs[1].querySelector("a");
      if (a) return a.textContent.trim();
    }
    const ukA = document.querySelector("ul.uk-tab li:not(.uk-tab-responsive) a");
    if (ukA) return ukA.textContent.replace(/\(.*?\)/g,"").replace(/\s+\d+$/,"").replace(/\s+/g," ").trim();
    return document.title.split("|")[0].trim();
  }

  // ── Inject badge CSS once ─────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("hz-tab-badge-styles")) return;
    const style = document.createElement("style");
    style.id = "hz-tab-badge-styles";
    style.textContent = `
      .hz-tab-unread {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #dc3545;
        color: #fff;
        font-size: 10px;
        font-weight: 600;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        padding: 0 5px;
        margin-left: 5px;
        vertical-align: middle;
        line-height: 1;
        font-family: Roboto, "Helvetica Neue", Arial, sans-serif;
        animation: hz-tab-pop .18s ease-out both;
      }
      @keyframes hz-tab-pop {
        from { transform: scale(0.5); opacity: 0; }
        to   { transform: scale(1);   opacity: 1; }
      }
      ul.uk-tab li.uk-active a .hz-tab-unread {
        background: #ffc107;
        color: #212529;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Keep badges live when read state changes ──────────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.hz_read_ids || changes.hz_announcements ||
        changes.hz_outlines || changes.hz_materials || changes.hz_submissions || changes.hz_grades)) {
      injectTabBadges();
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    const path = window.location.pathname.toLowerCase();
    const isCourse = path.includes("/student/course/");
    if (!isCourse) return;

    injectStyles();

    // Wait for tab nav to render
    const tryInject = () => {
      const tabNav = document.querySelector("ul.uk-tab");
      if (tabNav) {
        injectTabBadges();
      } else {
        setTimeout(tryInject, 400);
      }
    };
    setTimeout(tryInject, 1000);
  }

  boot();
})();
