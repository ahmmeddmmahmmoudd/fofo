// src/db.js
const { DatabaseSync } = require('node:sqlite');

function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  return db;
}

module.exports = { openDb };
