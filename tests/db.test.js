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
  assert.ok(tables.includes('rooms'));
  assert.ok(tables.includes('play_sessions'));
  assert.ok(tables.includes('sessions_store'));

  db.close();
  fs.unlinkSync(dbPath);
});

test('can insert and read a business row', () => {
  const dbPath = path.join(__dirname, 'tmp-db2.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);

  const info = db.prepare(
    `INSERT INTO businesses (name, email, password_hash, created_at)
     VALUES (?, ?, ?, ?)`
  ).run('Alpha Lounge', 'owner@alpha.test', 'hashedpw', new Date().toISOString());

  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(info.lastInsertRowid);
  assert.equal(row.name, 'Alpha Lounge');
  assert.equal(row.email, 'owner@alpha.test');

  db.close();
  fs.unlinkSync(dbPath);
});
