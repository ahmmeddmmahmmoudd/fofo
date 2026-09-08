// src/db.js
const { DatabaseSync } = require('node:sqlite');

function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      name TEXT NOT NULL,
      ps_type TEXT NOT NULL,
      hourly_rate REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'empty',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS play_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES rooms(id),
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      revenue REAL
    );

    CREATE TABLE IF NOT EXISTS sessions_store (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_business ON rooms(business_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_business ON play_sessions(business_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_room ON play_sessions(room_id);
  `);

  return db;
}

module.exports = { openDb };
