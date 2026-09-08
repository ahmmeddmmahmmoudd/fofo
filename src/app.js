// src/app.js
const express = require('express');
const session = require('express-session');
const { openDb } = require('./db');
const { SqliteSessionStore } = require('./sessionStore');
const { createAuthRouter } = require('./routes/auth');

function createApp(dbPath) {
  const db = openDb(dbPath);
  const app = express();
  app.use(express.json());

  app.use(session({
    store: new SqliteSessionStore(db),
    secret: process.env.SESSION_SECRET || 'fady-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    }
  }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter(db));

  app.locals.db = db;

  // Override listen()/close() so the db file handle is released synchronously
  // when the server closes — tests immediately unlink the db file after
  // server.close(), and on Windows an open sqlite handle would make that
  // fail with EBUSY if we waited for the async 'close' event instead.
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
