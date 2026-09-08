// tests/sessionStore.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { openDb } = require('../src/db');
const { SqliteSessionStore } = require('../src/sessionStore');

function withDb(name, fn) {
  const dbPath = path.join(__dirname, name);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);
  return Promise.resolve(fn(db)).finally(() => {
    db.close();
    fs.unlinkSync(dbPath);
  });
}

test('set then get returns the same session data', () => withDb('tmp-store1.db', (db) => {
  return new Promise((resolve, reject) => {
    const store = new SqliteSessionStore(db);
    const data = { businessId: 42, cookie: { maxAge: 86400000 } };
    store.set('sid-1', data, (err) => {
      if (err) return reject(err);
      store.get('sid-1', (err2, result) => {
        if (err2) return reject(err2);
        assert.equal(result.businessId, 42);
        resolve();
      });
    });
  });
}));

test('get returns null for unknown sid', () => withDb('tmp-store2.db', (db) => {
  return new Promise((resolve, reject) => {
    const store = new SqliteSessionStore(db);
    store.get('nope', (err, result) => {
      if (err) return reject(err);
      assert.equal(result, null);
      resolve();
    });
  });
}));

test('destroy removes the session', () => withDb('tmp-store3.db', (db) => {
  return new Promise((resolve, reject) => {
    const store = new SqliteSessionStore(db);
    const data = { businessId: 1, cookie: { maxAge: 86400000 } };
    store.set('sid-2', data, () => {
      store.destroy('sid-2', () => {
        store.get('sid-2', (err, result) => {
          if (err) return reject(err);
          assert.equal(result, null);
          resolve();
        });
      });
    });
  });
}));
