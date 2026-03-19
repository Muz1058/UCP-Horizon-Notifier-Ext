// background/notificationEngine.js ¢â‚¬â€ v17
// Service Worker: storage routing, notifications, alarms.
// v17: single write path via SAVE_UPDATES; dedup by stable content-based ID.

"use strict";

const ALARM_PERIOD_MINUTES = 5;
let saveQueue = Promise.resolve();

function enqueueSave(task) {
  saveQueue = saveQueue.then(task, task);
  return saveQueue;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("hz_periodic_scan", { periodInMinutes: ALARM_PERIOD_MINUTES });
});

// ¢â€â‚¬¢â€â‚¬ Detect new login via session_id cookie change 
// Fires whenever the portal sets a new session_id (login event).
// Notifies the active dashboard tab to trigger auto-scan.
chrome.cookies.onChanged.addListener(change => {
  // Only care about horizon.ucp.edu.pk session_id being SET (not removed)
  if (change.removed) return;
  const c = change.cookie;
  if (c.domain !== "horizon.ucp.edu.pk" && c.domain !== ".horizon.ucp.edu.pk") return;
  if (c.name !== "session_id") return;

  const newSessionId = c.value;
  if (!newSessionId) return;

  // Check if this session was already scanned
  chrome.storage.local.get("hz_last_session_id", res => {
    if (res.hz_last_session_id === newSessionId) return; // already handled

    // Find the dashboard tab and tell it to run auto-scan
    chrome.tabs.query(
      { url: ["https://horizon.ucp.edu.pk/student/dashboard*",
               "https://horizon.ucp.edu.pk/student/home*",
               "https://horizon.ucp.edu.pk/student/"] },
      tabs => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: "TRIGGER_AUTO_SCAN",
            sessionId: newSessionId
          }).catch(() => {
            // Tab may not have content script ready yet ¢â‚¬â€ retry after 2s
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, {
                action: "TRIGGER_AUTO_SCAN",
                sessionId: newSessionId
              }).catch(() => {});
            }, 2000);
          });
        });

        // If no dashboard tab open, store pending flag so next dashboard visit triggers it
        if (!tabs.length) {
          chrome.storage.local.set({ hz_pending_auto_scan: newSessionId });
        }
      }
    );
  });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "hz_periodic_scan") triggerAllCourseTabs();
});

function triggerAllCourseTabs() {
  chrome.tabs.query({ url: "https://horizon.ucp.edu.pk/student/course/*/*" }, tabs => {
    tabs.forEach(t => chrome.tabs.sendMessage(t.id, { action:"TRIGGER_SCAN" }).catch(()=>{}));
  });
}

// ¢â€â‚¬¢â€â‚¬ Read-state helper ¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬
function getReadIds() {
  return new Promise(r => {
    chrome.storage.local.get("hz_read_ids", res =>
      r(new Set(Object.keys(res.hz_read_ids || {})))
    );
  });
}

// ¢â€â‚¬¢â€â‚¬ Message handler ¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;

  switch (msg.action) {

    // Popup / content requests full state
    case "GET_UPDATES": {
      chrome.storage.local.get(
        ["hz_announcements","hz_materials","hz_submissions","hz_grades",
         "hz_outlines","hz_lastScanned","hz_read_ids"],
        res => sendResponse({ data: {
          announcements: res.hz_announcements || [],
          materials:     res.hz_materials     || [],
          submissions:   res.hz_submissions   || [],
          grades:        res.hz_grades        || [],
          outlines:      res.hz_outlines      || [],
          lastScanned:   res.hz_lastScanned   || null,
          readIds:       res.hz_read_ids      || {},
        }})
      );
      return true;
    }

    // Dashboard content script asks the background worker for the current
    // Horizon session cookie because HttpOnly cookies are not readable there.
    case "GET_CURRENT_SESSION_ID": {
      chrome.cookies.get(
        { url: "https://horizon.ucp.edu.pk", name: "session_id" },
        cookie => sendResponse({ sessionId: cookie?.value || "" })
      );
      return true;
    }

    // ¢â€â‚¬¢â€â‚¬ SAVE_UPDATES: THE single write path ¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬¢â€â‚¬
    // Payload contains full arrays for one course (from any scanner).
    // Strategy: replace all existing items for this course, keep items from
    // other courses unchanged. This means re-scanning a course never duplicates.
    case "SAVE_UPDATES": {
      enqueueSave(() => new Promise((resolve, reject) => {
        const p   = msg.payload || {};
        const now = new Date().toISOString();

        const normalizeName = s => String(s||"")
          .replace(/\(.*?\)/g, "")
          .replace(/\s+\d+$/, "")
          .replace(/\s+/g, " ")
          .trim();

        const normalizeItems = arr => (arr||[]).map(item => ({
          ...item,
          courseName: normalizeName(item.courseName),
        }));

        const fetchStatus = {
          announcements: p.fetchStatus?.announcements !== false,
          materials:     p.fetchStatus?.materials     !== false,
          submissions:   p.fetchStatus?.submissions   !== false,
          grades:        p.fetchStatus?.grades        !== false,
          outlines:      p.fetchStatus?.outlines      !== false,
        };

        const cleanP = {
          announcements: normalizeItems(p.announcements),
          materials:     normalizeItems(p.materials),
          submissions:   normalizeItems(p.submissions),
          grades:        normalizeItems(p.grades),
          outlines:      normalizeItems(p.outlines),
        };

        const payloadCourseName = normalizeName(p.courseName);
        const coursesInPayload = new Set();
        if (payloadCourseName) coursesInPayload.add(payloadCourseName);
        [...cleanP.announcements,...cleanP.materials,...cleanP.submissions,...cleanP.grades,...cleanP.outlines]
          .forEach(i => { if (i.courseName) coursesInPayload.add(i.courseName); });

        chrome.storage.local.get(
          ["hz_announcements","hz_materials","hz_submissions","hz_grades","hz_outlines","hz_read_ids"],
          res => {
            const readIds = res.hz_read_ids || {};

            const merge = (stored, incoming, typeKey) => {
              const normalizedStored = (stored||[]).map(i => ({
                ...i,
                courseName: normalizeName(i.courseName),
              }));

              if (!fetchStatus[typeKey]) {
                return normalizedStored.slice(0, 500);
              }

              const kept = normalizedStored.filter(i => !coursesInPayload.has(i.courseName));
              const deduped = dedupe([...incoming, ...kept], "id");
              return deduped.slice(0, 500);
            };

            const newAnn = cleanP.announcements;
            const newMat = cleanP.materials;
            const newSub = cleanP.submissions;
            const newGrd = cleanP.grades;
            const newOut = cleanP.outlines;

            chrome.storage.local.set({
              hz_announcements: merge(res.hz_announcements, newAnn, "announcements"),
              hz_materials:     merge(res.hz_materials,     newMat, "materials"),
              hz_submissions:   merge(res.hz_submissions,   newSub, "submissions"),
              hz_grades:        merge(res.hz_grades,        newGrd, "grades"),
              hz_outlines:      merge(res.hz_outlines,      newOut, "outlines"),
              hz_lastScanned:   now,
            }, () => {
              const isNew = (item, stored) => {
                const storedIds = new Set((stored||[]).map(i=>i.id));
                return !storedIds.has(item.id) && !readIds[item.id];
              };
              newAnn.filter(i=>isNew(i,res.hz_announcements))
                .forEach(i=>fireNotification(i.id,"New Announcement",`${i.courseName}\n${i.subject||""}`));
              newMat.filter(i=>isNew(i,res.hz_materials))
                .forEach(i=>fireNotification(i.id,"New Material",`${i.courseName}\n${i.fileName||""}`));
              newSub.filter(i=>isNew(i,res.hz_submissions))
                .forEach(i=>fireNotification(i.id,"New Submission",`${i.courseName}\n${i.name||""}`));
              newGrd.filter(i=>isNew(i,res.hz_grades))
                .forEach(i=>fireNotification(i.id,"Grade Updated",`${i.courseName}\n${i.assessment||""}`));
              newOut.filter(i=>isNew(i,res.hz_outlines))
                .forEach(i=>fireNotification(i.id,"New Outline File",`${i.courseName}\n${i.title||i.fileName||""}`));
              resolve();
            });
          }
        );
      }))
        .then(() => sendResponse({ ok:true }))
        .catch(err => sendResponse({ ok:false, error: err?.message || "save_failed" }));
      return true;
    }

    // Send a Chrome notification (guard against already-read)
    case "SEND_NOTIFICATION": {
      const { id, title, message } = msg.payload || {};
      if (!id || !title) break;
      chrome.storage.local.get("hz_read_ids", res => {
        if (!(res.hz_read_ids||{})[id]) fireNotification(id, title, message);
      });
      sendResponse({ ok:true });
      break;
    }

    // Mark items as read
    case "MARK_READ": {
      const ids = Array.isArray(msg.ids) ? msg.ids : (msg.id ? [msg.id] : []);
      if (!ids.length) { sendResponse({ ok:true }); break; }
      chrome.storage.local.get("hz_read_ids", res => {
        const rd = res.hz_read_ids || {};
        ids.forEach(id => { rd[id] = true; });
        chrome.storage.local.set({ hz_read_ids: rd }, () => sendResponse({ ok:true }));
      });
      return true;
    }

    // Popup "Scan Now" ¢â‚¬â€ trigger all open course tabs
    case "TRIGGER_BG_SCAN": {
      triggerAllCourseTabs();
      sendResponse({ ok:true });
      break;
    }

    // Clear all updates (keep read state so re-scanned items stay read)
    case "CLEAR_UPDATES": {
      chrome.storage.local.set({
        hz_announcements:[], hz_materials:[], hz_submissions:[], hz_grades:[], hz_outlines:[],
        hz_lastScanned:null,
      }, () => sendResponse({ ok:true }));
      return true;
    }

    // Full reset including read state
    case "CLEAR_READ_STATE": {
      chrome.storage.local.remove("hz_read_ids", () => sendResponse({ ok:true }));
      return true;
    }

    // Relay "Scan All" to dashboard content script
    case "SCAN_ALL_COURSES": {
      chrome.tabs.query({ url:"https://horizon.ucp.edu.pk/*" }, tabs => {
        if (!tabs.length) { sendResponse({ error:"No Horizon tab open." }); return; }
        const dash = tabs.find(t =>
          t.url && (t.url.includes("/student/dashboard") ||
                    t.url.includes("/student/home") ||
                    /horizon\.ucp\.edu\.pk\/?(\?|#|$)/.test(t.url))
        ) || tabs[0];
        chrome.tabs.sendMessage(dash.id, { action:"INITIATE_SCAN_ALL" }, res => {
          if (chrome.runtime.lastError)
            sendResponse({ error:"Navigate to the Horizon dashboard first." });
          else
            sendResponse({ ok:true, courses:res?.courses||0 });
        });
      });
      return true;
    }

    // Relay individual course scan to content script (DOMParser unavailable in SW)
    case "SCAN_COURSE": {
      const courseId = msg.courseId;
      if (!courseId) { sendResponse({ ok:false }); break; }
      const doScan = tabId => {
        chrome.tabs.sendMessage(tabId, { action:"DO_COURSE_SCAN", courseId }, res => {
          sendResponse(chrome.runtime.lastError ? { ok:false } : (res||{ok:true}));
        });
      };
      if (sender?.tab?.id) {
        doScan(sender.tab.id);
      } else {
        chrome.tabs.query({ url:"https://horizon.ucp.edu.pk/*" }, tabs => {
          if (tabs.length) doScan(tabs[0].id);
          else sendResponse({ ok:false });
        });
      }
      return true;
    }

    default: break;
  }
});

function fireNotification(id, title, message) {
  chrome.notifications.create(String(id), {
    type:"basic", iconUrl:"../assets/icon48.png",
    title, message:message||"", priority:1,
  }).catch(()=>{});
}

function dedupe(arr, key) {
  const seen = new Set();
  return arr.filter(item => {
    if (!item || seen.has(item[key])) return false;
    seen.add(item[key]);
    return true;
  });
}
