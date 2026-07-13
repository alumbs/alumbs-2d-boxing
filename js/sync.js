// Cloud save for a career, backed by mini-app-data (one JSON blob per app).
//
// The whole feature is opt-in and gated behind hasKeys(): with no keys stored,
// every method is a no-op and the game runs exactly as it did before — career
// lives only in localStorage. Paste an app_key + write_key (saved to
// localStorage on THIS device) and the same career follows you anywhere you
// sign in.
//
// Blob shape: { career: <the alumbs-career-v1 object>, updatedAt: <ISO string> }
// The game only ever touches `career`; `updatedAt` is wrapper metadata used to
// decide whose copy wins when a device loads (newer timestamp adopted).
class CareerSync {
  constructor() {
    this.base = 'https://birskvvccy886c6vsy1s6ioi.37.27.189.252.sslip.io';
    this.APP_KEY = 'alumbs-sync-app-key';
    this.WRITE_KEY = 'alumbs-sync-write-key';
  }

  appKey() { try { return localStorage.getItem(this.APP_KEY) || ''; } catch (e) { return ''; } }
  writeKey() { try { return localStorage.getItem(this.WRITE_KEY) || ''; } catch (e) { return ''; } }
  // Read needs only the app_key; write additionally needs the write_key.
  // Entering just the app_key gives a read-only ("load my career, don't
  // touch it") session — pull() runs, push() stays a no-op.
  canRead() { return !!this.appKey(); }
  canWrite() { return !!(this.appKey() && this.writeKey()); }

  setKeys(appKey, writeKey) {
    try {
      localStorage.setItem(this.APP_KEY, appKey.trim());
      // Write key is optional — a blank one leaves the session read-only.
      if (writeKey.trim()) localStorage.setItem(this.WRITE_KEY, writeKey.trim());
      else localStorage.removeItem(this.WRITE_KEY);
    } catch (e) { /* private mode — sync just won't persist keys */ }
  }
  clearKeys() {
    try {
      localStorage.removeItem(this.APP_KEY);
      localStorage.removeItem(this.WRITE_KEY);
    } catch (e) { /* ignore */ }
  }

  // GET the server blob. Returns the parsed blob ({} if nothing saved yet),
  // or null on any failure (no keys, offline, 403, bad JSON) — callers treat
  // null as "server had nothing usable" and keep the local copy.
  async pull() {
    if (!this.canRead()) return null;
    try {
      const res = await fetch(`${this.base}/api/data`, {
        headers: { 'X-App-Key': this.appKey() },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // PUT the whole blob (the API does a full replace, not a merge). Fire-and-
  // forget: resolves true on success, false on any failure. A failed push
  // never disturbs the local save — the next successful push catches up.
  async push(career) {
    if (!this.canWrite() || !career) return false;
    const blob = { career, updatedAt: nowIso() };
    try {
      const res = await fetch(`${this.base}/api/data`, {
        method: 'PUT',
        headers: {
          'X-App-Key': this.appKey(),
          'X-Write-Key': this.writeKey(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(blob),
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }
}

// Wall-clock timestamp for the blob wrapper. Isolated in one helper so the
// dependency on the clock is obvious and easy to reason about.
function nowIso() {
  return new Date().toISOString();
}
