// src/db.js
const Database = require('better-sqlite3');

function openDb(dbPath) {
  const db = new Database(dbPath);
  return db;
}

module.exports = { openDb };
