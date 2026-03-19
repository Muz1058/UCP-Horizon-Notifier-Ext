// content/readTracker.js — v16
// Shared read/unread state module.
// Loaded as a content script so it's available to dashboardScanner.js,
// courseProxy.js and any other content scripts that need read state.
//
// Storage key: hz_read_ids  →  { [id]: true }
// A flat object is used for O(1) lookups without deserialising an array.
//
// API (attached to window.HZReadTracker):
//   markRead(id)            → Promise<void>
//   markAllRead(ids[])      → Promise<void>
//   isRead(id)              → boolean  (uses cached in-memory copy)
//   getReadIds()            → Set<string>  (live cache)
//   getUnreadFrom(items[])  → items[]  filtered to unread
//   onReadChange(fn)        → register listener called after any write

(function (global) {
  "use strict";

  // ── In-memory cache ───────────────────────────────────────────────────────
  let _cache = {};          // { id: true }
  let _loaded = false;
  let _listeners = [];

  // ── Load from storage once ────────────────────────────────────────────────
  function _load() {
    return new Promise(r => {
      chrome.storage.local.get("hz_read_ids", res => {
        _cache = res.hz_read_ids || {};
        _loaded = true;
        r();
      });
    });
  }

  // Ensure cache is warm before any operation
  function _ensureLoaded() {
    if (_loaded) return Promise.resolve();
    return _load();
  }

  // ── Write helpers ─────────────────────────────────────────────────────────
  function _save() {
    return new Promise(r => chrome.storage.local.set({ hz_read_ids: _cache }, r));
  }

  function _notify() {
    _listeners.forEach(fn => { try { fn(); } catch(e) {/**/} });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async function markRead(id) {
    await _ensureLoaded();
    if (_cache[id]) return;       // already read — no write needed
    _cache[id] = true;
    await _save();
    _notify();
  }

  async function markAllRead(ids) {
    if (!ids || !ids.length) return;
    await _ensureLoaded();
    let changed = false;
    ids.forEach(id => { if (!_cache[id]) { _cache[id] = true; changed = true; } });
    if (!changed) return;
    await _save();
    _notify();
  }

  function isRead(id) {
    return !!_cache[id];
  }

  function getReadIds() {
    return new Set(Object.keys(_cache));
  }

  function getUnreadFrom(items) {
    return items.filter(item => !_cache[item.id]);
  }

  function onReadChange(fn) {
    _listeners.push(fn);
  }

  // Keep cache in sync when another script writes to storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.hz_read_ids) {
      _cache = changes.hz_read_ids.newValue || {};
      _loaded = true;
      _notify();
    }
  });

  // Pre-warm cache immediately on script load
  _load();

  // ── Export ────────────────────────────────────────────────────────────────
  global.HZReadTracker = {
    markRead,
    markAllRead,
    isRead,
    getReadIds,
    getUnreadFrom,
    onReadChange,
  };

})(window);
