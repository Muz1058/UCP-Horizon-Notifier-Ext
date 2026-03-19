// content/courseProxy.js ¢â‚¬â€ v17
// Handles DO_COURSE_SCAN messages from the background service worker.
// Uses DOMParser (available in content scripts, NOT in service workers).
// v17: stable content-based IDs (no courseName), single SAVE_UPDATES write path.

(function () {
  "use strict";

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "DO_COURSE_SCAN" && msg.courseId) {
      scanCourse(msg.courseId)
        .then(result => sendResponse({ ok:true, ...result }))
        .catch(err  => sendResponse({ ok:false, error:err.message }));
      return true;
    }
  });

  async function scanCourse(courseId) {
    const base = window.location.origin;
    const urls = {
      info:       `${base}/student/course/info/${courseId}`,
      outline:    `${base}/student/course/outline/${courseId}`,
      material:   `${base}/student/course/material/${courseId}`,
      submission: `${base}/student/course/submission/${courseId}`,
      gradebook:  `${base}/student/course/gradebook/${courseId}`,
    };

    const [infoHtml, outHtml, matHtml, subHtml, grdHtml] = await Promise.all(
      Object.values(urls).map(url =>
        fetch(url, { credentials:"include" }).then(r=>r.ok?r.text():"").catch(()=>"")
      )
    );

    const parse = html => new DOMParser().parseFromString(html, "text/html");
    // Try canonical name from dashboard registry first (most reliable)
    const courseName = await getCanonicalName(courseId, parse(infoHtml));

    const ann = parseAnnouncements(parse(infoHtml), courseName, courseId);
    const out = parseOutlines(parse(outHtml),      courseName, courseId);
    const mat = parseMaterials(parse(matHtml),  courseName, courseId);
    const sub = parseSubmissions(parse(subHtml), courseName, courseId);
    const grd = parseGrades(parse(grdHtml),     courseName, courseId);

    // Single write path ¢â‚¬â€ background handles dedup and replace-by-course
    await new Promise(r =>
      chrome.runtime.sendMessage({
        action: "SAVE_UPDATES",
        payload: { announcements:ann, materials:mat, submissions:sub, grades:grd, outlines:out }
      }, r)
    );

    await markCourseScanned(courseId);

    return { courseName, ann:ann.length, out:out.length, mat:mat.length, sub:sub.length, grd:grd.length };
  }

  // ¢â€â‚¬¢â€â‚¬ Course name extraction ¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬
  function cleanName(s) {
    return String(s)
      .replace(/\(.*?\)/g, "")    // strip (N) count suffixes
      .replace(/\s+\d+$/, "")     // strip trailing bare numbers e.g. "Course 8"
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractCourseName(doc, fallback) {
    const crumbs = doc.querySelectorAll("#breadcrumbs li");
    if (crumbs.length >= 2) {
      const a = crumbs[1].querySelector("a");
      if (a) { const n = cleanName(a.textContent); if (n.length > 1) return n; }
    }
    const ukA = doc.querySelector("ul.uk-tab li:not(.uk-tab-responsive) a");
    if (ukA) { const n = cleanName(ukA.textContent); if (n.length > 1) return n; }
    const title = doc.title || "";
    if (title) return cleanName(title.split("|")[0]);
    return cleanName(fallback || "") || "Unknown Course";
  }

  // ¢â€â‚¬¢â€â‚¬ Stable ID: based on content only, NOT courseName ¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬
  // Using courseId + content fields so the same item always gets the same ID
  // regardless of which scan path ran or what name was resolved.
  function makeId(prefix, courseId, ...parts) {
    const s = [courseId, ...parts].join("||");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return prefix + "_" + Math.abs(h).toString(36);
  }

  // ¢â€â‚¬¢â€â‚¬ Parsers ¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬
  // Note: courseId is passed through for stable ID generation
  function parseAnnouncements(doc, courseName, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h.includes("subject"))) continue;
      const iS=ths.findIndex(h=>h.includes("subject")), iD=ths.findIndex(h=>h.includes("date")),
            iDe=ths.findIndex(h=>h.includes("desc")),   iA=ths.findIndex(h=>h.includes("attach"));
      tbl.querySelectorAll("tbody tr").forEach(row => {
        const td=row.querySelectorAll("td"); if(td.length<3) return;
        const subject=td[iS>=0?iS:1]?.textContent.trim()||"";
        const date   =td[iD>=0?iD:2]?.textContent.trim()||"";
        const desc   =td[iDe>=0?iDe:3]?.textContent.trim()||"";
        const attLink=(iA>=0&&td[iA])?td[iA].querySelector("a[href]")?.href||null:null;
        if (!subject||subject.length<2) return;
        // ID uses subject+date only (stable across scan sources)
        items.push({
          id: makeId("ann", courseId, subject, date),
          courseName, tabLabel:"Course News",
          subject, date, description:desc.substring(0,300), attachmentLink:attLink,
          courseId, scannedAt: new Date().toISOString(),
        });
      });
    }
    return items;
  }

  function parseMaterials(doc, courseName, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h.includes("material")||h.includes("file"))) continue;
      const iF=ths.findIndex(h=>h.includes("material")||h.includes("file")),
            iD=ths.findIndex(h=>h.includes("desc")), iDl=ths.findIndex(h=>h.includes("download"));
      tbl.querySelectorAll("tbody tr").forEach(row => {
        const td=row.querySelectorAll("td"); if(td.length<2) return;
        const fileName=td[iF>=0?iF:1]?.textContent.trim()||"";
        const desc    =td[iD>=0?iD:2]?.textContent.trim()||"";
        let dlLink    =(iDl>=0&&td[iDl])?td[iDl].querySelector("a[href]")?.href||null:null;
        if (!dlLink) dlLink=row.querySelector("a[href*='/material/download/'],a[href*='/download/']")?.href||null;
        if (!fileName||fileName.length<2) return;
        items.push({
          id: makeId("mat", courseId, fileName, dlLink || desc),
          courseName, tabLabel:"Course Material",
          fileName, description:desc, downloadLink:dlLink,
          courseId, scannedAt: new Date().toISOString(),
        });
      });
    }
    return items;
  }

  function parseOutlines(doc, courseName, courseId) {
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
        items.push({
          id: makeId("out", courseId, weekNo, downloadLink),
          courseName, tabLabel:"Course Outline",
          title, weekNo, description:body.substring(0,300), fileName:files||title,
          downloadLink, courseId, scannedAt:new Date().toISOString(),
        });
      });
    }
    return items;
  }

  function parseSubmissions(doc, courseName, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h==="name")||!ths.some(h=>h.includes("due"))) continue;
      let rows = Array.from(tbl.querySelectorAll("tbody tr[submission_id]"));
      if (!rows.length) rows = Array.from(tbl.querySelectorAll("tbody tr")).filter(r=>r.querySelectorAll("td").length>=4);
      rows.forEach(row => {
        const nt=row.querySelector("td.rec_submission_title"), st=row.querySelector("td.rec_submission_date"),
              dt=row.querySelector("td.rec_submission_due_date"), td=row.querySelectorAll("td");
        const name    =(nt||td[1])?.textContent.trim()||"";
        const startDate=(st||td[3])?.textContent.trim()||"";
        const dueDate  =(dt||td[4])?.textContent.trim()||"";
        const subId    =row.getAttribute("submission_id")||"";
        if (!name||name.length<2) return;
        items.push({
          id: makeId("sub", courseId, subId||name, startDate),
          courseName, tabLabel:"Course Submission",
          name, startDate, dueDate, courseId, scannedAt:new Date().toISOString(),
        });
      });
    }
    return items;
  }

  function parseGrades(doc, courseName, courseId) {
    const items = [];
    for (const tbl of doc.querySelectorAll("table")) {
      const ths = Array.from(tbl.querySelectorAll("thead th")).map(h=>h.textContent.trim().toLowerCase());
      if (!ths.some(h=>h.includes("assessment"))) continue;
      const iT=ths.findIndex(h=>h.includes("assessment")),
            iP=ths.findIndex(h=>h.includes("percentage")||h.includes("obtained")||h.includes("marks"));
      tbl.querySelectorAll("tbody tr").forEach(row => {
        const td=row.querySelectorAll("td"); if(td.length<1) return;
        const assessment=td[iT>=0?iT:0]?.textContent.trim()||"";
        const rawPct    =td[iP>=0?iP:1]?.textContent.trim()||"";
        if (!assessment||assessment.length<2) return;
        const numeric = parseFloat(rawPct.replace(/[^\d.]/g,""));
        items.push({
          id: makeId("grd", courseId, assessment),
          courseName, tabLabel:"Course Grade Book",
          assessment, percentage:isNaN(numeric)?null:numeric, percentageDisplay:rawPct||"¢â‚¬â€",
          courseId, scannedAt: new Date().toISOString(),
        });
      });
    }
    return items;
  }

  // ¢â€â‚¬¢â€â‚¬ Session flag ¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬
  // Look up canonical course name from dashboard's stored registry
  // Falls back to extractCourseName only if no registry entry exists
  function getCanonicalName(courseId, infoDoc) {
    return new Promise(r => {
      chrome.storage.local.get("hz_scanned_courses_session", res => {
        const names = res.hz_scanned_courses_session?.names || {};
        if (names[courseId]) {
          r(names[courseId]);
        } else {
          r(extractCourseName(infoDoc, courseId));
        }
      });
    });
  }

  function markCourseScanned(courseId) {
    return new Promise(r => {
      chrome.storage.local.get("hz_scanned_courses_session", res => {
        const rec = res.hz_scanned_courses_session || { ids:[], names:{} };
        if (!rec.ids.includes(courseId)) rec.ids.push(courseId);
        chrome.storage.local.set({ hz_scanned_courses_session:rec }, r);
      });
    });
  }

  // ¢â€â‚¬¢â€â‚¬ Utility ¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬
  function notify(id, title, message) {
    chrome.runtime.sendMessage({ action:"SEND_NOTIFICATION", payload:{id,title,message} }).catch(()=>{});
  }

})();
