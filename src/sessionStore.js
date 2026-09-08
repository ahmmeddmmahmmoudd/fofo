// src/sessionStore.js
const session = require('express-session');

class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }

  get(sid, cb) {
    try {
      const row = this.db
        .prepare('SELECT data, expires FROM sessions_store WHERE sid = ?')
        .get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) {
        this.db.prepare('DELETE FROM sessions_store WHERE sid = ?').run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sessionData, cb) {
    try {
      const maxAge =
        sessionData.cookie && sessionData.cookie.maxAge
          ? sessionData.cookie.maxAge
          : 86400000;
      const expires = Date.now() + maxAge;
      const data = JSON.stringify(sessionData);
      this.db
        .prepare(
          `INSERT INTO sessions_store (sid, data, expires) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`
        )
        .run(sid, data, expires);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions_store WHERE sid = ?').run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
