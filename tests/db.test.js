// tests/db.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { openDb } = require('../src/db');

test('openDb creates all required tables', () => {
  const dbPath = path.join(__dirname, 'tmp-db.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);

  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);

  assert.ok(tables.includes('businesses'));
  assert.ok(tables.includes('units'));
  assert.ok(tables.includes('bookings'));
  assert.ok(tables.includes('overbooking_incidents'));
  assert.ok(tables.includes('sessions_store'));

  db.close();
  fs.unlinkSync(dbPath);
});

test('can insert and read a gaming business row with policy defaults', () => {
  const dbPath = path.join(__dirname, 'tmp-db2.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);

  const info = db.prepare(
    `INSERT INTO businesses (name, email, password_hash, business_type, grace_window_minutes, deposit_required, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('Alpha Lounge', 'owner@alpha.test', 'hashedpw', 'gaming', 60, 0, new Date().toISOString());

  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(info.lastInsertRowid);
  assert.equal(row.name, 'Alpha Lounge');
  assert.equal(row.business_type, 'gaming');
  assert.equal(row.grace_window_minutes, 60);
  assert.equal(row.reliability_score, 100);

  db.close();
  fs.unlinkSync(dbPath);
});

test('can insert a gaming unit and a restaurant unit with vertical-specific columns', () => {
  const dbPath = path.join(__dirname, 'tmp-db3.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);

  const biz = db.prepare(
    `INSERT INTO businesses (name, email, password_hash, business_type, grace_window_minutes, deposit_required, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('Biz', 'biz@test.com', 'hash', 'gaming', 60, 0, new Date().toISOString());

  const unitInfo = db.prepare(
    `INSERT INTO units (business_id, name, ps_type, hourly_rate, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(biz.lastInsertRowid, 'Room 1', 'PS5', 60, new Date().toISOString());

  const unit = db.prepare('SELECT * FROM units WHERE id = ?').get(unitInfo.lastInsertRowid);
  assert.equal(unit.ps_type, 'PS5');
  assert.equal(unit.hourly_rate, 60);
  assert.equal(unit.capacity, null);
  assert.equal(unit.status, 'empty');

  db.close();
  fs.unlinkSync(dbPath);
});
