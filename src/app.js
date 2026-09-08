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

  // Wrap listen() to close database when server closes
  const originalListen = app.listen;
  app.listen = function(...args) {
    const server = originalListen.apply(this, args);
    const originalClose = server.close;
    server.close = function(...closeArgs) {
      db.close();
      return originalClose.apply(this, closeArgs);
    };
    return server;
  };

  return app;
}

module.exports = { createApp };
