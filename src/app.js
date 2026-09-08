// src/app.js
const express = require('express');
const { openDb } = require('./db');

function createApp(dbPath) {
  const db = openDb(dbPath);
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
