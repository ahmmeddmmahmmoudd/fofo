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
      business_type TEXT NOT NULL,
      grace_window_minutes INTEGER NOT NULL DEFAULT 60,
      deposit_required INTEGER NOT NULL DEFAULT 0,
      deposit_amount REAL,
      refund_cutoff_minutes INTEGER,
      reliability_score REAL NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'empty',
      created_at TEXT NOT NULL,
      ps_type TEXT,
      hourly_rate REAL,
      capacity INTEGER
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_start TEXT NOT NULL,
      grace_window_minutes INTEGER NOT NULL,
      auto_cancel_at TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      cancelled_at TEXT,
      cancelled_by TEXT,
      revenue REAL,
      deposit_amount REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS overbooking_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL REFERENCES businesses(id),
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      logged_at TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions_store (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_units_business ON units(business_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_business ON bookings(business_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_unit ON bookings(unit_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_business ON overbooking_incidents(business_id);
  `);

  return db;
}

module.exports = { openDb };
