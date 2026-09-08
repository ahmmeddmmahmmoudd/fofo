# fofo Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fofo Phase 1 core platform — a multi-tenant Node.js web app where a PlayStation-lounge business owner signs up, manages rooms, toggles room occupancy (empty/busy), and sees automatically-computed revenue and a client CRM view.

**Architecture:** A single Node.js + Express server serves a JSON API and static frontend files from one process. Data lives in a SQLite file (`data/fofo.db`) accessed synchronously via Node's built-in `node:sqlite` module (`DatabaseSync`) — no native compilation step, unlike third-party SQLite bindings. Auth is cookie-based sessions backed by a small custom SQLite-backed session store (so logins survive server restarts) with passwords hashed via `bcryptjs`. The frontend is plain HTML/CSS/JS using `fetch`, no build step, with an Arabic/English toggle and RTL support.

> **Amendment (ruling recorded during Task 1 execution):** the plan originally specified `better-sqlite3`. That package requires native compilation and failed on the target Windows dev machine (no Visual Studio Build Tools), and would likely fail the same way on many hosting providers without a C++ toolchain. It was replaced with Node's built-in `node:sqlite` (`DatabaseSync`), which has a compatible synchronous API (`.exec()`, `.prepare(sql).run()/.get()/.all()`, `run()` returns `{changes, lastInsertRowid}`) and needs no native dependency at all. Requires Node >= 24.0.0 (the verified-working version — pinned via `engines` in package.json).

**Tech Stack:** Node.js (>=24.0.0), Express, node:sqlite (built-in), express-session, bcryptjs, Node's built-in `node:test` runner.

**Spec:** `docs/superpowers/specs/2026-09-08-fofo-phase1-design.md`

## Global Constraints

- Every `/api/*` route except `/api/auth/signup` and `/api/auth/login` requires an authenticated session (401 if not authenticated).
- All room/session/CRM data is scoped to `req.session.businessId` — a business must never see or modify another business's data. Cross-tenant access attempts return 404 (not 403), so as not to leak whether a resource ID exists for another tenant.
- Revenue = `hours_elapsed * hourly_rate`, rounded to 2 decimal places, computed server-side only (never trust a client-supplied revenue value).
- Passwords are always stored as bcrypt hashes (`bcryptjs`), never plaintext.
- Timestamps stored as ISO 8601 strings (`new Date().toISOString()`).
- UI strings come from `public/js/i18n.js`; Arabic is the default language, `dir="rtl"` when Arabic is active.

---

## File Structure

```
fofo/
  package.json
  server.js                      # entry point: opens DB, creates app, listens
  .gitignore
  src/
    app.js                       # createApp(dbPath) -> configured Express app
    db.js                        # openDb(dbPath) -> node:sqlite DatabaseSync instance + schema
    authUtils.js                 # hashPassword / verifyPassword
    sessionStore.js              # SqliteSessionStore (express-session Store)
    middleware/
      requireAuth.js             # requireAuth(req,res,next)
    routes/
      auth.js                    # createAuthRouter(db)
      rooms.js                   # createRoomsRouter(db)
      sessions.js                # createSessionsRouter(db) (play-session start/end)
      crm.js                     # createCrmRouter(db)
  public/
    login.html                   # signup/login page
    index.html                   # dashboard shell
    css/style.css
    js/i18n.js
    js/api.js                    # fetch wrapper
    js/auth-page.js               # login.html logic
    js/dashboard.js              # index.html logic
  tests/
    health.test.js
    db.test.js
    authUtils.test.js
    sessionStore.test.js
    auth-routes.test.js
    rooms-routes.test.js
    sessions-routes.test.js
    crm-routes.test.js
  data/
    .gitkeep
```

---

### Task 1: Project scaffold + health check

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/app.js`
- Create: `server.js`
- Create: `data/.gitkeep`
- Test: `tests/health.test.js`

**Interfaces:**
- Produces: `createApp(dbPath: string) -> express.Application` exported from `src/app.js` (later tasks add routes onto this app).

- [ ] **Step 1: Write the failing test**

```js
// tests/health.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../src/app');

test('GET /health returns ok', async () => {
  const dbPath = path.join(__dirname, 'tmp-health.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const app = createApp(dbPath);
  const server = app.listen(0);
  const port = server.address().port;

  const res = await fetch(`http://localhost:${port}/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { status: 'ok' });

  server.close();
  fs.unlinkSync(dbPath);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Create package.json**

```json
{
  "name": "fofo",
  "version": "1.0.0",
  "description": "fofo - booking and CRM platform for PlayStation lounge owners",
  "main": "server.js",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "express": "^4.19.2",
    "express-session": "^1.18.0"
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
data/*.db
data/*.db-journal
data/*.db-wal
data/*.db-shm
*.log
```

- [ ] **Step 5: Create data/.gitkeep**

Empty file so the `data/` directory exists in git even though its `.db` contents are ignored.

- [ ] **Step 6: Write src/app.js**

```js
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
```

- [ ] **Step 7: Write minimal src/db.js stub (fleshed out fully in Task 2)**

```js
// src/db.js
const { DatabaseSync } = require('node:sqlite');

function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  return db;
}

module.exports = { openDb };
```

- [ ] **Step 8: Write server.js**

```js
// server.js
const path = require('node:path');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.FOFO_DB_PATH || path.join(__dirname, 'data', 'fofo.db');

const app = createApp(DB_PATH);
app.listen(PORT, () => {
  console.log(`fofo server listening on port ${PORT}`);
});
```

- [ ] **Step 9: Install dependencies**

Run: `cd "D:\Ai Agents\Claude\Artifacts\fofo-phase1-core-platform" && npm install`
Expected: installs express, bcryptjs, express-session without errors (node:sqlite is built into Node, no package needed).

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .gitignore data/.gitkeep src/app.js src/db.js server.js tests/health.test.js
git commit -m "feat: scaffold express app with health check endpoint"
```

---

### Task 2: Database module with full schema

**Files:**
- Modify: `src/db.js`
- Test: `tests/db.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `openDb(dbPath: string) -> DatabaseSync` where the returned `node:sqlite` instance has tables `businesses`, `rooms`, `play_sessions`, `sessions_store` created (`CREATE TABLE IF NOT EXISTS`).

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no such table: businesses

- [ ] **Step 3: Implement full schema in src/db.js**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests, including Task 1's health test)

- [ ] **Step 5: Commit**

```bash
git add src/db.js tests/db.test.js
git commit -m "feat: add full sqlite schema for businesses, rooms, play_sessions"
```

---

### Task 3: Password hashing utilities

**Files:**
- Create: `src/authUtils.js`
- Test: `tests/authUtils.test.js`

**Interfaces:**
- Produces: `hashPassword(password: string) -> string`, `verifyPassword(password: string, hash: string) -> boolean`.

- [ ] **Step 1: Write the failing test**

```js
// tests/authUtils.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/authUtils');

test('hashPassword produces a hash different from the plaintext', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.notEqual(hash, 'correct horse battery staple');
  assert.ok(hash.length > 20);
});

test('verifyPassword returns true for the correct password', () => {
  const hash = hashPassword('mySecret123');
  assert.equal(verifyPassword('mySecret123', hash), true);
});

test('verifyPassword returns false for the wrong password', () => {
  const hash = hashPassword('mySecret123');
  assert.equal(verifyPassword('wrongPassword', hash), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/authUtils'`

- [ ] **Step 3: Implement src/authUtils.js**

```js
// src/authUtils.js
const bcrypt = require('bcryptjs');

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = { hashPassword, verifyPassword };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/authUtils.js tests/authUtils.test.js
git commit -m "feat: add bcrypt password hashing utilities"
```

---

### Task 4: SQLite-backed session store

**Files:**
- Create: `src/sessionStore.js`
- Test: `tests/sessionStore.test.js`

**Interfaces:**
- Consumes: `openDb` from `src/db.js` (for the test's temp DB), the `sessions_store` table from Task 2.
- Produces: `SqliteSessionStore` class (extends `express-session`'s `Store`) with `get(sid, cb)`, `set(sid, sessionData, cb)`, `destroy(sid, cb)`, constructed as `new SqliteSessionStore(db)`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/sessionStore'`

- [ ] **Step 3: Implement src/sessionStore.js**

```js
// src/sessionStore.js
const session = require('express-session');

class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }

  get(sid, cb) {
    try {
      const row = this.db
        .prepare('SELECT data, expires FROM sessions_store WHERE sid = ?')
        .get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) {
        this.db.prepare('DELETE FROM sessions_store WHERE sid = ?').run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sessionData, cb) {
    try {
      const maxAge =
        sessionData.cookie && sessionData.cookie.maxAge
          ? sessionData.cookie.maxAge
          : 86400000;
      const expires = Date.now() + maxAge;
      const data = JSON.stringify(sessionData);
      this.db
        .prepare(
          `INSERT INTO sessions_store (sid, data, expires) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`
        )
        .run(sid, data, expires);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions_store WHERE sid = ?').run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sessionStore.js tests/sessionStore.test.js
git commit -m "feat: add sqlite-backed express-session store"
```

---

### Task 5: Auth middleware + signup/login/logout/me routes

**Files:**
- Create: `src/middleware/requireAuth.js`
- Create: `src/routes/auth.js`
- Modify: `src/app.js`
- Test: `tests/auth-routes.test.js`

**Interfaces:**
- Consumes: `openDb` (db.js), `hashPassword`/`verifyPassword` (authUtils.js), `SqliteSessionStore` (sessionStore.js).
- Produces:
  - `requireAuth(req, res, next)` middleware — 401s if `!req.session.businessId`.
  - `createAuthRouter(db) -> express.Router` mounted at `/api/auth` with routes `POST /signup`, `POST /login`, `POST /logout`, `GET /me`.
  - `req.session.businessId: number` and `req.session.businessName: string` set on successful signup/login — later tasks (rooms, sessions, crm routes) read `req.session.businessId` to scope queries.

- [ ] **Step 1: Write the failing test**

```js
// tests/auth-routes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../src/app');

function startApp(name) {
  const dbPath = path.join(__dirname, name);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const app = createApp(dbPath);
  const server = app.listen(0);
  const port = server.address().port;
  return {
    base: `http://localhost:${port}`,
    close: () => {
      server.close();
      fs.unlinkSync(dbPath);
    }
  };
}

function getCookie(res) {
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(';')[0] : null;
}

test('signup creates a business and returns 201', async () => {
  const ctx = startApp('tmp-auth1.db');
  const res = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alpha Lounge', email: 'a@test.com', password: 'pass1234' })
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.email, 'a@test.com');
  assert.ok(body.id);
  ctx.close();
});

test('signup with duplicate email returns 409', async () => {
  const ctx = startApp('tmp-auth2.db');
  const payload = { name: 'A', email: 'dup@test.com', password: 'pass1234' };
  await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const res2 = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  assert.equal(res2.status, 409);
  ctx.close();
});

test('login with correct credentials returns 200 and sets a session cookie', async () => {
  const ctx = startApp('tmp-auth3.db');
  await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'login@test.com', password: 'pass1234' })
  });
  const res = await fetch(`${ctx.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'login@test.com', password: 'pass1234' })
  });
  assert.equal(res.status, 200);
  assert.ok(getCookie(res));
  ctx.close();
});

test('login with wrong password returns 401', async () => {
  const ctx = startApp('tmp-auth4.db');
  await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'wp@test.com', password: 'pass1234' })
  });
  const res = await fetch(`${ctx.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wp@test.com', password: 'wrongpass' })
  });
  assert.equal(res.status, 401);
  ctx.close();
});

test('GET /api/auth/me without a session returns 401', async () => {
  const ctx = startApp('tmp-auth5.db');
  const res = await fetch(`${ctx.base}/api/auth/me`);
  assert.equal(res.status, 401);
  ctx.close();
});

test('GET /api/auth/me with a valid session returns the business', async () => {
  const ctx = startApp('tmp-auth6.db');
  await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alpha', email: 'me@test.com', password: 'pass1234' })
  });
  const loginRes = await fetch(`${ctx.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'me@test.com', password: 'pass1234' })
  });
  const cookie = getCookie(loginRes);
  const meRes = await fetch(`${ctx.base}/api/auth/me`, { headers: { Cookie: cookie } });
  const meBody = await meRes.json();
  assert.equal(meRes.status, 200);
  assert.equal(meBody.email, 'me@test.com');
  ctx.close();
});

test('logout destroys the session', async () => {
  const ctx = startApp('tmp-auth7.db');
  await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'lo@test.com', password: 'pass1234' })
  });
  const loginRes = await fetch(`${ctx.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lo@test.com', password: 'pass1234' })
  });
  const cookie = getCookie(loginRes);
  await fetch(`${ctx.base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  const meRes = await fetch(`${ctx.base}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(meRes.status, 401);
  ctx.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — 404s, no `/api/auth/*` routes registered yet.

- [ ] **Step 3: Implement src/middleware/requireAuth.js**

```js
// src/middleware/requireAuth.js
function requireAuth(req, res, next) {
  if (!req.session || !req.session.businessId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

module.exports = { requireAuth };
```

- [ ] **Step 4: Implement src/routes/auth.js**

```js
// src/routes/auth.js
const express = require('express');
const { hashPassword, verifyPassword } = require('../authUtils');
const { requireAuth } = require('../middleware/requireAuth');

function createAuthRouter(db) {
  const router = express.Router();

  router.post('/signup', (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    const existing = db.prepare('SELECT id FROM businesses WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const passwordHash = hashPassword(password);
    const createdAt = new Date().toISOString();
    const info = db
      .prepare('INSERT INTO businesses (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(name, email, passwordHash, createdAt);

    req.session.businessId = info.lastInsertRowid;
    req.session.businessName = name;

    res.status(201).json({ id: info.lastInsertRowid, name, email });
  });

  router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const business = db.prepare('SELECT * FROM businesses WHERE email = ?').get(email);
    if (!business || !verifyPassword(password, business.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    req.session.businessId = business.id;
    req.session.businessName = business.name;
    res.status(200).json({ id: business.id, name: business.name, email: business.email });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ ok: true });
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    const business = db
      .prepare('SELECT id, name, email FROM businesses WHERE id = ?')
      .get(req.session.businessId);
    if (!business) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.status(200).json(business);
  });

  return router;
}

module.exports = { createAuthRouter };
```

- [ ] **Step 5: Wire session middleware and the auth router into src/app.js**

```js
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
    secret: process.env.SESSION_SECRET || 'fofo-dev-secret-change-in-production',
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
  return app;
}

module.exports = { createApp };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests including Tasks 1-4)

- [ ] **Step 7: Commit**

```bash
git add src/middleware/requireAuth.js src/routes/auth.js src/app.js tests/auth-routes.test.js
git commit -m "feat: add signup/login/logout/me auth routes with sqlite sessions"
```

---

### Task 6: Rooms CRUD routes with business isolation

**Files:**
- Create: `src/routes/rooms.js`
- Modify: `src/app.js`
- Test: `tests/rooms-routes.test.js`

**Interfaces:**
- Consumes: `requireAuth` middleware, `req.session.businessId` set by Task 5's auth routes.
- Produces: `createRoomsRouter(db) -> express.Router` mounted at `/api/rooms`:
  - `GET /` -> `200 [{id, name, ps_type, hourly_rate, status}]`
  - `POST /` body `{name, ps_type, hourly_rate}` -> `201 {id, name, ps_type, hourly_rate, status: 'empty'}`
  - `PUT /:id` body `{name, ps_type, hourly_rate}` -> `200 {id, name, ps_type, hourly_rate, status}` or `404`
  - `DELETE /:id` -> `204` or `404` or `409` (room is busy)

- [ ] **Step 1: Write the failing test**

```js
// tests/rooms-routes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../src/app');

function startApp(name) {
  const dbPath = path.join(__dirname, name);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const app = createApp(dbPath);
  const server = app.listen(0);
  const port = server.address().port;
  return {
    base: `http://localhost:${port}`,
    close: () => { server.close(); fs.unlinkSync(dbPath); }
  };
}

function getCookie(res) {
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(';')[0] : null;
}

async function signupAndLogin(base, email) {
  const res = await fetch(`${base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Biz', email, password: 'pass1234' })
  });
  return getCookie(res);
}

test('POST /api/rooms without auth returns 401', async () => {
  const ctx = startApp('tmp-rooms1.db');
  const res = await fetch(`${ctx.base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Room 1', ps_type: 'PS5', hourly_rate: 60 })
  });
  assert.equal(res.status, 401);
  ctx.close();
});

test('create then list rooms for the logged-in business', async () => {
  const ctx = startApp('tmp-rooms2.db');
  const cookie = await signupAndLogin(ctx.base, 'r1@test.com');

  const createRes = await fetch(`${ctx.base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Room 1', ps_type: 'PS5', hourly_rate: 60 })
  });
  const created = await createRes.json();
  assert.equal(createRes.status, 201);
  assert.equal(created.status, 'empty');

  const listRes = await fetch(`${ctx.base}/api/rooms`, { headers: { Cookie: cookie } });
  const list = await listRes.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Room 1');
  ctx.close();
});

test('a business cannot see or edit another business room', async () => {
  const ctx = startApp('tmp-rooms3.db');
  const cookieA = await signupAndLogin(ctx.base, 'ra@test.com');
  const cookieB = await signupAndLogin(ctx.base, 'rb@test.com');

  const createRes = await fetch(`${ctx.base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({ name: 'A Room', ps_type: 'PS4', hourly_rate: 40 })
  });
  const room = await createRes.json();

  const listResB = await fetch(`${ctx.base}/api/rooms`, { headers: { Cookie: cookieB } });
  const listB = await listResB.json();
  assert.equal(listB.length, 0);

  const editResB = await fetch(`${ctx.base}/api/rooms/${room.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({ name: 'Hacked', ps_type: 'PS4', hourly_rate: 999 })
  });
  assert.equal(editResB.status, 404);
  ctx.close();
});

test('deleting a room with an active session returns 409', async () => {
  const ctx = startApp('tmp-rooms4.db');
  const cookie = await signupAndLogin(ctx.base, 'rd@test.com');
  const createRes = await fetch(`${ctx.base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Room X', ps_type: 'PS4', hourly_rate: 40 })
  });
  const room = await createRes.json();

  const db = require('../src/db').openDb(path.join(__dirname, 'tmp-rooms4.db'));
  db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run('busy', room.id);
  db.close();

  const delRes = await fetch(`${ctx.base}/api/rooms/${room.id}`, {
    method: 'DELETE', headers: { Cookie: cookie }
  });
  assert.equal(delRes.status, 409);
  ctx.close();
});

test('deleting an empty room succeeds with 204', async () => {
  const ctx = startApp('tmp-rooms5.db');
  const cookie = await signupAndLogin(ctx.base, 're@test.com');
  const createRes = await fetch(`${ctx.base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Room Y', ps_type: 'PS5', hourly_rate: 60 })
  });
  const room = await createRes.json();
  const delRes = await fetch(`${ctx.base}/api/rooms/${room.id}`, {
    method: 'DELETE', headers: { Cookie: cookie }
  });
  assert.equal(delRes.status, 204);
  ctx.close();
});

test('creating a room with rate <= 0 returns 400', async () => {
  const ctx = startApp('tmp-rooms6.db');
  const cookie = await signupAndLogin(ctx.base, 'rf@test.com');
  const res = await fetch(`${ctx.base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Bad Room', ps_type: 'PS5', hourly_rate: 0 })
  });
  assert.equal(res.status, 400);
  ctx.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — 404s on `/api/rooms`

- [ ] **Step 3: Implement src/routes/rooms.js**

```js
// src/routes/rooms.js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

const VALID_PS_TYPES = ['PS4', 'PS5'];

function createRoomsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const rooms = db
      .prepare('SELECT id, name, ps_type, hourly_rate, status FROM rooms WHERE business_id = ? ORDER BY id')
      .all(req.session.businessId);
    res.status(200).json(rooms);
  });

  router.post('/', (req, res) => {
    const { name, ps_type, hourly_rate } = req.body || {};
    if (!name || !VALID_PS_TYPES.includes(ps_type) || !(hourly_rate > 0)) {
      return res.status(400).json({ error: 'name, a valid ps_type (PS4/PS5) and hourly_rate > 0 are required' });
    }
    const createdAt = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO rooms (business_id, name, ps_type, hourly_rate, status, created_at)
         VALUES (?, ?, ?, ?, 'empty', ?)`
      )
      .run(req.session.businessId, name, ps_type, hourly_rate, createdAt);
    res.status(201).json({ id: info.lastInsertRowid, name, ps_type, hourly_rate, status: 'empty' });
  });

  router.put('/:id', (req, res) => {
    const room = db
      .prepare('SELECT * FROM rooms WHERE id = ? AND business_id = ?')
      .get(req.params.id, req.session.businessId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { name, ps_type, hourly_rate } = req.body || {};
    if (!name || !VALID_PS_TYPES.includes(ps_type) || !(hourly_rate > 0)) {
      return res.status(400).json({ error: 'name, a valid ps_type (PS4/PS5) and hourly_rate > 0 are required' });
    }
    db.prepare('UPDATE rooms SET name = ?, ps_type = ?, hourly_rate = ? WHERE id = ?')
      .run(name, ps_type, hourly_rate, room.id);
    res.status(200).json({ id: room.id, name, ps_type, hourly_rate, status: room.status });
  });

  router.delete('/:id', (req, res) => {
    const room = db
      .prepare('SELECT * FROM rooms WHERE id = ? AND business_id = ?')
      .get(req.params.id, req.session.businessId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status === 'busy') {
      return res.status(409).json({ error: 'End the active session before deleting this room' });
    }
    db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
    res.status(204).send();
  });

  return router;
}

module.exports = { createRoomsRouter };
```

- [ ] **Step 4: Wire rooms router into src/app.js**

```js
// src/app.js — add near the other require() calls at the top:
const { createRoomsRouter } = require('./routes/rooms');

// and add this line after `app.use('/api/auth', createAuthRouter(db));`:
app.use('/api/rooms', createRoomsRouter(db));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/rooms.js src/app.js tests/rooms-routes.test.js
git commit -m "feat: add rooms CRUD routes scoped to the logged-in business"
```

---

### Task 7: Occupancy toggle — start/end play sessions

**Files:**
- Create: `src/routes/sessions.js`
- Modify: `src/app.js`
- Test: `tests/sessions-routes.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `rooms` table/status column from Task 6.
- Produces: `createSessionsRouter(db) -> express.Router` mounted at `/api/rooms`:
  - `POST /:id/start` body `{client_name, client_phone}` -> `201 {id, room_id, client_name, client_phone, started_at}` or `404`/`409`
  - `POST /:id/end` -> `200 {id, room_id, client_name, client_phone, started_at, ended_at, revenue}` or `404`/`409`

- [ ] **Step 1: Write the failing test**

```js
// tests/sessions-routes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../src/app');
const { openDb } = require('../src/db');

function startApp(name) {
  const dbPath = path.join(__dirname, name);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const app = createApp(dbPath);
  const server = app.listen(0);
  const port = server.address().port;
  return {
    base: `http://localhost:${port}`,
    dbPath,
    close: () => { server.close(); fs.unlinkSync(dbPath); }
  };
}

function getCookie(res) {
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(';')[0] : null;
}

async function setup(base) {
  const signupRes = await fetch(`${base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Biz', email: `u${Date.now()}@test.com`, password: 'pass1234' })
  });
  const cookie = getCookie(signupRes);
  const roomRes = await fetch(`${base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Room 1', ps_type: 'PS5', hourly_rate: 60 })
  });
  const room = await roomRes.json();
  return { cookie, room };
}

test('starting a session on an empty room sets it busy', async () => {
  const ctx = startApp('tmp-sess1.db');
  const { cookie, room } = await setup(ctx.base);

  const res = await fetch(`${ctx.base}/api/rooms/${room.id}/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ client_name: 'Karim', client_phone: '0100000000' })
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.client_name, 'Karim');
  assert.ok(body.started_at);

  const listRes = await fetch(`${ctx.base}/api/rooms`, { headers: { Cookie: cookie } });
  const list = await listRes.json();
  assert.equal(list[0].status, 'busy');
  ctx.close();
});

test('starting a session on an already-busy room returns 409', async () => {
  const ctx = startApp('tmp-sess2.db');
  const { cookie, room } = await setup(ctx.base);
  await fetch(`${ctx.base}/api/rooms/${room.id}/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ client_name: 'Karim', client_phone: '0100000000' })
  });
  const res2 = await fetch(`${ctx.base}/api/rooms/${room.id}/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ client_name: 'Sara', client_phone: '0111111111' })
  });
  assert.equal(res2.status, 409);
  ctx.close();
});

test('ending a session computes revenue and frees the room', async () => {
  const ctx = startApp('tmp-sess3.db');
  const { cookie, room } = await setup(ctx.base);
  const startRes = await fetch(`${ctx.base}/api/rooms/${room.id}/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ client_name: 'Karim', client_phone: '0100000000' })
  });
  const started = await startRes.json();

  // backdate started_at by exactly 1 hour so revenue is deterministic (rate=60/hr)
  const db = openDb(ctx.dbPath);
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  db.prepare('UPDATE play_sessions SET started_at = ? WHERE id = ?').run(oneHourAgo, started.id);
  db.close();

  const endRes = await fetch(`${ctx.base}/api/rooms/${room.id}/end`, {
    method: 'POST', headers: { Cookie: cookie }
  });
  const ended = await endRes.json();
  assert.equal(endRes.status, 200);
  assert.ok(ended.revenue >= 59.9 && ended.revenue <= 60.1);
  assert.ok(ended.ended_at);

  const listRes = await fetch(`${ctx.base}/api/rooms`, { headers: { Cookie: cookie } });
  const list = await listRes.json();
  assert.equal(list[0].status, 'empty');
  ctx.close();
});

test('ending a session on a room with no active session returns 409', async () => {
  const ctx = startApp('tmp-sess4.db');
  const { cookie, room } = await setup(ctx.base);
  const res = await fetch(`${ctx.base}/api/rooms/${room.id}/end`, {
    method: 'POST', headers: { Cookie: cookie }
  });
  assert.equal(res.status, 409);
  ctx.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — 404s on `/api/rooms/:id/start` and `/end`

- [ ] **Step 3: Implement src/routes/sessions.js**

```js
// src/routes/sessions.js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

function createSessionsRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/:id/start', (req, res) => {
    const room = db
      .prepare('SELECT * FROM rooms WHERE id = ? AND business_id = ?')
      .get(req.params.id, req.session.businessId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status === 'busy') {
      return res.status(409).json({ error: 'Room already has an active session' });
    }

    const { client_name, client_phone } = req.body || {};
    if (!client_name || !client_phone) {
      return res.status(400).json({ error: 'client_name and client_phone are required' });
    }

    const startedAt = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO play_sessions (room_id, business_id, client_name, client_phone, started_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(room.id, req.session.businessId, client_name, client_phone, startedAt);
    db.prepare("UPDATE rooms SET status = 'busy' WHERE id = ?").run(room.id);

    res.status(201).json({
      id: info.lastInsertRowid,
      room_id: room.id,
      client_name,
      client_phone,
      started_at: startedAt
    });
  });

  router.post('/:id/end', (req, res) => {
    const room = db
      .prepare('SELECT * FROM rooms WHERE id = ? AND business_id = ?')
      .get(req.params.id, req.session.businessId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'busy') {
      return res.status(409).json({ error: 'This room has no active session' });
    }

    const active = db
      .prepare('SELECT * FROM play_sessions WHERE room_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1')
      .get(room.id);
    if (!active) return res.status(409).json({ error: 'This room has no active session' });

    const endedAt = new Date();
    const startedAt = new Date(active.started_at);
    const hours = (endedAt.getTime() - startedAt.getTime()) / 3600000;
    const revenue = Math.round(hours * room.hourly_rate * 100) / 100;
    const endedAtIso = endedAt.toISOString();

    db.prepare('UPDATE play_sessions SET ended_at = ?, revenue = ? WHERE id = ?')
      .run(endedAtIso, revenue, active.id);
    db.prepare("UPDATE rooms SET status = 'empty' WHERE id = ?").run(room.id);

    res.status(200).json({
      id: active.id,
      room_id: room.id,
      client_name: active.client_name,
      client_phone: active.client_phone,
      started_at: active.started_at,
      ended_at: endedAtIso,
      revenue
    });
  });

  return router;
}

module.exports = { createSessionsRouter };
```

- [ ] **Step 4: Wire sessions router into src/app.js**

```js
// src/app.js — add near the other require() calls at the top:
const { createSessionsRouter } = require('./routes/sessions');

// and add this line after `app.use('/api/rooms', createRoomsRouter(db));`:
app.use('/api/rooms', createSessionsRouter(db));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/sessions.js src/app.js tests/sessions-routes.test.js
git commit -m "feat: add start/end play-session routes with revenue calculation"
```

---

### Task 8: CRM routes — clients aggregation + revenue summary

**Files:**
- Create: `src/routes/crm.js`
- Modify: `src/app.js`
- Test: `tests/crm-routes.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `play_sessions` rows produced by Task 7's `/end` route.
- Produces: `createCrmRouter(db) -> express.Router` mounted at `/api/crm`:
  - `GET /clients` -> `200 [{name, phone, visits, total_spent, last_visit}]` sorted by `total_spent` desc.
  - `GET /revenue` -> `200 {today, week, month, by_room: [{room_id, room_name, total}]}`

- [ ] **Step 1: Write the failing test**

```js
// tests/crm-routes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../src/app');
const { openDb } = require('../src/db');

function startApp(name) {
  const dbPath = path.join(__dirname, name);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const app = createApp(dbPath);
  const server = app.listen(0);
  const port = server.address().port;
  return {
    base: `http://localhost:${port}`,
    dbPath,
    close: () => { server.close(); fs.unlinkSync(dbPath); }
  };
}

function getCookie(res) {
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(';')[0] : null;
}

test('GET /api/crm/clients aggregates completed sessions by phone', async () => {
  const ctx = startApp('tmp-crm1.db');
  const signupRes = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Biz', email: 'crm1@test.com', password: 'pass1234' })
  });
  const cookie = getCookie(signupRes);
  const signupBody = await signupRes.json();
  const businessId = signupBody.id;

  const roomRes = await fetch(`${ctx.base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Room 1', ps_type: 'PS5', hourly_rate: 60 })
  });
  const room = await roomRes.json();

  const db = openDb(ctx.dbPath);
  const now = Date.now();
  db.prepare(
    `INSERT INTO play_sessions (room_id, business_id, client_name, client_phone, started_at, ended_at, revenue)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(room.id, businessId, 'Karim', '0100000000', new Date(now - 7200000).toISOString(), new Date(now - 3600000).toISOString(), 60);
  db.prepare(
    `INSERT INTO play_sessions (room_id, business_id, client_name, client_phone, started_at, ended_at, revenue)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(room.id, businessId, 'Karim', '0100000000', new Date(now - 1800000).toISOString(), new Date(now).toISOString(), 30);
  db.close();

  const res = await fetch(`${ctx.base}/api/crm/clients`, { headers: { Cookie: cookie } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].phone, '0100000000');
  assert.equal(body[0].visits, 2);
  assert.equal(body[0].total_spent, 90);
  ctx.close();
});

test('GET /api/crm/revenue sums today/week/month and per-room totals', async () => {
  const ctx = startApp('tmp-crm2.db');
  const signupRes = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Biz', email: 'crm2@test.com', password: 'pass1234' })
  });
  const cookie = getCookie(signupRes);
  const signupBody = await signupRes.json();
  const businessId = signupBody.id;

  const roomRes = await fetch(`${ctx.base}/api/rooms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Room 1', ps_type: 'PS4', hourly_rate: 40 })
  });
  const room = await roomRes.json();

  const db = openDb(ctx.dbPath);
  const now = Date.now();
  // one session ended today
  db.prepare(
    `INSERT INTO play_sessions (room_id, business_id, client_name, client_phone, started_at, ended_at, revenue)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(room.id, businessId, 'Sara', '0111111111', new Date(now - 3600000).toISOString(), new Date(now).toISOString(), 40);
  // one session ended 20 days ago (outside this month if near month start; still included in an "all time" style test tolerance is avoided by asserting >= )
  db.prepare(
    `INSERT INTO play_sessions (room_id, business_id, client_name, client_phone, started_at, ended_at, revenue)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(room.id, businessId, 'Old Client', '0122222222', new Date(now - 90 * 86400000).toISOString(), new Date(now - 90 * 86400000).toISOString(), 100);
  db.close();

  const res = await fetch(`${ctx.base}/api/crm/revenue`, { headers: { Cookie: cookie } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.today, 40);
  assert.ok(body.week >= 40);
  assert.equal(body.by_room.length, 1);
  assert.equal(body.by_room[0].room_name, 'Room 1');
  ctx.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — 404s on `/api/crm/clients` and `/api/crm/revenue`

- [ ] **Step 3: Implement src/routes/crm.js**

```js
// src/routes/crm.js
const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeekIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString();
}

function startOfMonthIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.toISOString();
}

function createCrmRouter(db) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/clients', (req, res) => {
    const rows = db
      .prepare(
        `SELECT client_name, client_phone,
                COUNT(*) as visits,
                SUM(revenue) as total_spent,
                MAX(ended_at) as last_visit
         FROM play_sessions
         WHERE business_id = ? AND ended_at IS NOT NULL
         GROUP BY client_phone
         ORDER BY total_spent DESC`
      )
      .all(req.session.businessId);

    res.status(200).json(
      rows.map((r) => ({
        name: r.client_name,
        phone: r.client_phone,
        visits: r.visits,
        total_spent: Math.round(r.total_spent * 100) / 100,
        last_visit: r.last_visit
      }))
    );
  });

  router.get('/revenue', (req, res) => {
    const businessId = req.session.businessId;
    const sumSince = (isoDate) => {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(revenue), 0) as total FROM play_sessions
           WHERE business_id = ? AND ended_at IS NOT NULL AND ended_at >= ?`
        )
        .get(businessId, isoDate);
      return Math.round(row.total * 100) / 100;
    };

    const today = sumSince(startOfTodayIso());
    const week = sumSince(startOfWeekIso());
    const month = sumSince(startOfMonthIso());

    const byRoom = db
      .prepare(
        `SELECT r.id as room_id, r.name as room_name, COALESCE(SUM(ps.revenue), 0) as total
         FROM rooms r
         LEFT JOIN play_sessions ps ON ps.room_id = r.id AND ps.ended_at IS NOT NULL
         WHERE r.business_id = ?
         GROUP BY r.id
         ORDER BY r.id`
      )
      .all(businessId)
      .map((r) => ({ room_id: r.room_id, room_name: r.room_name, total: Math.round(r.total * 100) / 100 }));

    res.status(200).json({ today, week, month, by_room: byRoom });
  });

  return router;
}

module.exports = { createCrmRouter };
```

- [ ] **Step 4: Wire crm router into src/app.js**

```js
// src/app.js — add near the other require() calls at the top:
const { createCrmRouter } = require('./routes/crm');

// and add this line after the sessions router line:
app.use('/api/crm', createCrmRouter(db));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/crm.js src/app.js tests/crm-routes.test.js
git commit -m "feat: add CRM clients aggregation and revenue summary routes"
```

---

### Task 9: i18n dictionary + API fetch wrapper (shared frontend utilities)

**Files:**
- Create: `public/js/i18n.js`
- Create: `public/js/api.js`
- Create: `public/css/style.css`

**Interfaces:**
- Produces:
  - `window.FOFO_I18N = { ar: {...}, en: {...} }` and `window.fofoT(key)` / `window.fofoSetLang(lang)` / `window.fofoGetLang()` globals used by both `auth-page.js` and `dashboard.js`.
  - `window.fofoApi.get(path)`, `window.fofoApi.post(path, body)`, `window.fofoApi.put(path, body)`, `window.fofoApi.del(path)` — each returns a Promise resolving to `{ok: boolean, status: number, data: any}` (never throws on non-2xx, so callers can branch on `ok`).

This task has no automated test (it's static, dependency-free browser JS with no server to hit yet); verification is manual via the browser console in Task 11's end-to-end check.

- [ ] **Step 1: Write public/css/style.css**

```css
:root{
  --bg:#F7F4EE; --surface:#FFFFFF; --surface-2:#EFE9DD;
  --text:#1C1A22; --text-muted:#716C7A; --border:#E4DDCC;
  --accent:#B96A22; --accent-strong:#9A5719; --accent-ink:#FFFFFF;
  --indigo:#2E2B66; --ok:#267A54; --ok-bg:#E4F2E9; --busy:#B5402E; --busy-bg:#F6E4DF;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#131220; --surface:#1B1A2C; --surface-2:#242238;
    --text:#EDEAF5; --text-muted:#9793AC; --border:#312E48;
    --accent:#E0923F; --accent-strong:#F0A254; --accent-ink:#1A1408;
    --indigo:#7A76E0; --ok:#4FB585; --ok-bg:#173226; --busy:#E27060; --busy-bg:#3A211C;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Cairo',-apple-system,'Segoe UI',sans-serif;text-align:start}
.num{font-variant-numeric:tabular-nums}
a{color:inherit}
button{font-family:inherit;cursor:pointer}
.wrap{max-width:1080px;margin:0 auto;padding:20px}
.btn{border:1px solid var(--border);background:var(--surface);color:var(--text);padding:8px 14px;border-radius:9px;font-size:.84rem;font-weight:600}
.btn:hover{border-color:var(--accent)}
.btn-accent{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn-accent:hover{background:var(--accent-strong);border-color:var(--accent-strong)}
.btn-danger{background:transparent;border-color:var(--busy);color:var(--busy)}
input{border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:8px;padding:9px 11px;font-size:.9rem;font-family:inherit;width:100%}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.06)}
.error{color:var(--busy);font-size:.8rem;font-weight:600;margin-top:6px}
.rooms{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;padding:4px 10px;border-radius:999px}
.pill.empty{background:var(--ok-bg);color:var(--ok)}
.pill.busy{background:var(--busy-bg);color:var(--busy)}
table{width:100%;border-collapse:collapse}
th,td{padding:10px 14px;text-align:start;font-size:.85rem}
thead th{font-size:.7rem;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border)}
tbody tr{border-bottom:1px solid var(--border)}
.table-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--border);border-radius:14px}
```

- [ ] **Step 2: Write public/js/i18n.js**

```js
// public/js/i18n.js
window.FOFO_I18N = {
  ar: {
    dir: 'rtl',
    appName: 'fofo',
    login: 'تسجيل الدخول', signup: 'إنشاء حساب', businessName: 'اسم النشاط',
    email: 'البريد الإلكتروني', password: 'كلمة المرور', submit: 'دخول',
    createAccount: 'إنشاء حساب جديد', haveAccount: 'لديك حساب بالفعل؟',
    noAccount: 'ليس لديك حساب؟', logout: 'تسجيل الخروج',
    rooms: 'الغرف', addRoom: 'إضافة غرفة', roomName: 'اسم الغرفة',
    psType: 'نوع الجهاز', hourlyRate: 'السعر بالساعة', empty: 'فارغة', busy: 'مشغولة',
    start: 'بدء جلسة', end: 'إنهاء الجلسة', clientName: 'اسم العميل', clientPhone: 'رقم الهاتف',
    confirm: 'تأكيد', cancel: 'إلغاء',
    statToday: 'إيراد اليوم', statWeek: 'إيراد هذا الأسبوع', statMonth: 'إيراد هذا الشهر',
    clients: 'العملاء', visits: 'عدد الزيارات', lastVisit: 'آخر زيارة', totalSpent: 'إجمالي الإنفاق',
    invalidLogin: 'البريد الإلكتروني أو كلمة المرور غير صحيحة', required: 'هذا الحقل مطلوب'
  },
  en: {
    dir: 'ltr',
    appName: 'fofo',
    login: 'Log in', signup: 'Sign up', businessName: 'Business name',
    email: 'Email', password: 'Password', submit: 'Log in',
    createAccount: 'Create a new account', haveAccount: 'Already have an account?',
    noAccount: "Don't have an account?", logout: 'Log out',
    rooms: 'Rooms', addRoom: 'Add room', roomName: 'Room name',
    psType: 'Console type', hourlyRate: 'Hourly rate', empty: 'Empty', busy: 'Busy',
    start: 'Start session', end: 'End session', clientName: 'Client name', clientPhone: 'Phone number',
    confirm: 'Confirm', cancel: 'Cancel',
    statToday: "Today's revenue", statWeek: "This week's revenue", statMonth: "This month's revenue",
    clients: 'Clients', visits: 'Visits', lastVisit: 'Last visit', totalSpent: 'Total spent',
    invalidLogin: 'Invalid email or password', required: 'This field is required'
  }
};

window.fofoGetLang = function () {
  try {
    return localStorage.getItem('fofo_lang') || 'ar';
  } catch (e) {
    return 'ar';
  }
};

window.fofoSetLang = function (lang) {
  try {
    localStorage.setItem('fofo_lang', lang);
  } catch (e) {}
  document.documentElement.lang = lang;
  document.documentElement.dir = window.FOFO_I18N[lang].dir;
};

window.fofoT = function (key) {
  const lang = window.fofoGetLang();
  return window.FOFO_I18N[lang][key] || key;
};
```

- [ ] **Step 3: Write public/js/api.js**

```js
// public/js/api.js
window.fofoApi = (function () {
  async function request(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path)
  };
})();
```

- [ ] **Step 4: Manual verification (no automated test for static JS)**

Run: `node -e "require('./public/js/i18n.js')"` is not applicable (browser globals) — instead just visually confirm the three files parse without syntax errors:
Run: `node --check public/js/i18n.js && node --check public/js/api.js && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add public/css/style.css public/js/i18n.js public/js/api.js
git commit -m "feat: add shared frontend i18n dictionary, api wrapper, and base styles"
```

---

### Task 10: Login/signup page

**Files:**
- Create: `public/login.html`
- Create: `public/js/auth-page.js`
- Modify: `src/app.js` (serve `public/` as static files)

**Interfaces:**
- Consumes: `window.fofoApi`, `window.fofoT`, `window.fofoSetLang`, `window.fofoGetLang` from Task 9. Calls `POST /api/auth/signup` and `POST /api/auth/login` from Task 5.
- Produces: on success, redirects the browser to `/index.html`.

- [ ] **Step 1: Serve the public/ folder as static files in src/app.js**

```js
// src/app.js — add near the top with other requires:
const path = require('node:path');

// add this line right after `app.use(express.json());`:
app.use(express.static(path.join(__dirname, '..', 'public')));
```

- [ ] **Step 2: Write public/login.html**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>fofo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" />
<link rel="stylesheet" href="/css/style.css" />
<style>
  body{display:flex;align-items:center;justify-content:center;min-height:100vh}
  .auth-card{max-width:380px;width:100%}
  .auth-card h1{font-size:1.3rem;margin:0 0 4px}
  .field{margin-bottom:12px}
  .field label{display:block;font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:5px}
  .switch{margin-top:14px;font-size:.82rem;text-align:center}
  .switch button{background:none;border:0;color:var(--accent);font-weight:700;padding:0}
  .langrow{position:fixed;top:16px;inset-inline-end:16px}
</style>
</head>
<body>
  <div class="langrow">
    <button class="btn" id="langToggle" style="font-size:.75rem;padding:6px 10px">EN/AR</button>
  </div>
  <div class="card auth-card">
    <h1 data-i18n="login" id="formTitle">Log in</h1>
    <form id="authForm">
      <div class="field" id="nameField" hidden>
        <label data-i18n="businessName">Business name</label>
        <input type="text" id="nameInput" />
      </div>
      <div class="field">
        <label data-i18n="email">Email</label>
        <input type="email" id="emailInput" required />
      </div>
      <div class="field">
        <label data-i18n="password">Password</label>
        <input type="password" id="passwordInput" required />
      </div>
      <button type="submit" class="btn btn-accent" style="width:100%" id="submitBtn" data-i18n="submit">Log in</button>
      <div class="error" id="formError" hidden></div>
    </form>
    <div class="switch">
      <span id="switchPrompt" data-i18n="noAccount">Don't have an account?</span>
      <button id="switchBtn" data-i18n="signup">Sign up</button>
    </div>
  </div>

  <script src="/js/i18n.js"></script>
  <script src="/js/api.js"></script>
  <script src="/js/auth-page.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write public/js/auth-page.js**

```js
// public/js/auth-page.js
(function () {
  var mode = 'login'; // or 'signup'

  function applyLang() {
    var lang = window.fofoGetLang();
    window.fofoSetLang(lang);
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = window.fofoT(el.getAttribute('data-i18n'));
    });
    renderMode();
  }

  function renderMode() {
    var isSignup = mode === 'signup';
    document.getElementById('nameField').hidden = !isSignup;
    document.getElementById('formTitle').textContent = window.fofoT(isSignup ? 'signup' : 'login');
    document.getElementById('submitBtn').textContent = window.fofoT(isSignup ? 'signup' : 'submit');
    document.getElementById('switchPrompt').textContent = window.fofoT(isSignup ? 'haveAccount' : 'noAccount');
    document.getElementById('switchBtn').textContent = window.fofoT(isSignup ? 'login' : 'signup');
  }

  document.getElementById('switchBtn').addEventListener('click', function () {
    mode = mode === 'login' ? 'signup' : 'login';
    renderMode();
  });

  document.getElementById('langToggle').addEventListener('click', function () {
    var next = window.fofoGetLang() === 'ar' ? 'en' : 'ar';
    window.fofoSetLang(next);
    applyLang();
  });

  document.getElementById('authForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var errorEl = document.getElementById('formError');
    errorEl.hidden = true;

    var email = document.getElementById('emailInput').value.trim();
    var password = document.getElementById('passwordInput').value;
    var name = document.getElementById('nameInput').value.trim();

    var path = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    var body = mode === 'signup' ? { name: name, email: email, password: password } : { email: email, password: password };

    var result = await window.fofoApi.post(path, body);
    if (!result.ok) {
      errorEl.textContent = (result.data && result.data.error) || window.fofoT('invalidLogin');
      errorEl.hidden = false;
      return;
    }
    window.location.href = '/index.html';
  });

  applyLang();
})();
```

- [ ] **Step 4: Manual verification**

Run: `npm start` then open `http://localhost:3000/login.html` in a browser.
Expected: Login form renders in Arabic/RTL by default; clicking the language button switches to English/LTR; switching to "Sign up" shows the business-name field; submitting a signup redirects to `/index.html` (which doesn't exist yet — a 404 here is expected until Task 11).
Stop the server with Ctrl+C when done.

- [ ] **Step 5: Commit**

```bash
git add public/login.html public/js/auth-page.js src/app.js
git commit -m "feat: add login/signup page with ar/en toggle"
```

---

### Task 11: Dashboard page (rooms, occupancy toggle, revenue, CRM)

**Files:**
- Create: `public/index.html`
- Create: `public/js/dashboard.js`

**Interfaces:**
- Consumes: `window.fofoApi`, `window.fofoT`, `window.fofoSetLang`/`fofoGetLang` (Task 9); `GET/POST /api/rooms`, `POST /api/rooms/:id/start`, `POST /api/rooms/:id/end`, `GET /api/crm/clients`, `GET /api/crm/revenue`, `GET /api/auth/me`, `POST /api/auth/logout` (Tasks 5-8).

- [ ] **Step 1: Write public/index.html**

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>fofo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" />
<link rel="stylesheet" href="/css/style.css" />
<style>
  header{display:flex;align-items:center;gap:12px;padding:16px 0 24px;flex-wrap:wrap}
  header .spacer{flex:1}
  .tile .label{font-size:.72rem;color:var(--text-muted);font-weight:700;text-transform:uppercase}
  .tile .value{font-size:1.6rem;font-weight:700;margin-top:6px}
  .room{display:flex;flex-direction:column;gap:10px}
  .room-top{display:flex;justify-content:space-between;align-items:flex-start}
  .badge{font-size:.68rem;font-weight:800;padding:3px 7px;border-radius:6px;background:var(--surface-2);color:var(--text-muted)}
  .inline-form{display:flex;flex-direction:column;gap:8px}
  .inline-form .row{display:flex;gap:8px}
  .inline-form .row button{flex:1}
  section{margin-bottom:28px}
  .sec-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
  .addroom{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .addroom input, .addroom select{width:auto}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <strong id="bizName">fofo</strong>
      <div class="spacer"></div>
      <button class="btn" id="langToggle" style="font-size:.75rem">EN/AR</button>
      <button class="btn" id="logoutBtn" data-i18n="logout">Log out</button>
    </header>

    <section class="stats">
      <div class="card tile"><div class="label" data-i18n="statToday">Today</div><div class="value num" id="statToday">0</div></div>
      <div class="card tile"><div class="label" data-i18n="statWeek">Week</div><div class="value num" id="statWeek">0</div></div>
      <div class="card tile"><div class="label" data-i18n="statMonth">Month</div><div class="value num" id="statMonth">0</div></div>
    </section>

    <section>
      <div class="sec-head"><h2 data-i18n="rooms">Rooms</h2></div>
      <div class="addroom card">
        <input type="text" id="newRoomName" placeholder="Room name" />
        <select id="newRoomPs">
          <option value="PS5">PS5</option>
          <option value="PS4">PS4</option>
        </select>
        <input type="number" id="newRoomRate" placeholder="Hourly rate" min="1" step="1" style="max-width:140px" />
        <button class="btn btn-accent" id="addRoomBtn" data-i18n="addRoom">Add room</button>
      </div>
      <div class="rooms" id="roomsGrid"></div>
    </section>

    <section>
      <div class="sec-head"><h2 data-i18n="clients">Clients</h2></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th data-i18n="clientName">Name</th>
              <th data-i18n="clientPhone">Phone</th>
              <th data-i18n="visits">Visits</th>
              <th data-i18n="lastVisit">Last visit</th>
              <th data-i18n="totalSpent">Total spent</th>
            </tr>
          </thead>
          <tbody id="crmBody"></tbody>
        </table>
      </div>
    </section>
  </div>

  <script src="/js/i18n.js"></script>
  <script src="/js/api.js"></script>
  <script src="/js/dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write public/js/dashboard.js**

```js
// public/js/dashboard.js
(function () {
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function applyLang() {
    var lang = window.fofoGetLang();
    window.fofoSetLang(lang);
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = window.fofoT(el.getAttribute('data-i18n'));
    });
  }

  async function requireSession() {
    var me = await window.fofoApi.get('/api/auth/me');
    if (!me.ok) {
      window.location.href = '/login.html';
      return null;
    }
    document.getElementById('bizName').textContent = me.data.name;
    return me.data;
  }

  async function loadStats() {
    var res = await window.fofoApi.get('/api/crm/revenue');
    if (!res.ok) return;
    document.getElementById('statToday').textContent = res.data.today;
    document.getElementById('statWeek').textContent = res.data.week;
    document.getElementById('statMonth').textContent = res.data.month;
  }

  async function loadClients() {
    var res = await window.fofoApi.get('/api/crm/clients');
    var body = document.getElementById('crmBody');
    if (!res.ok || res.data.length === 0) {
      body.innerHTML = '<tr><td colspan="5">-</td></tr>';
      return;
    }
    body.innerHTML = res.data.map(function (c) {
      return '<tr>' +
        '<td>' + escapeHTML(c.name) + '</td>' +
        '<td class="num">' + escapeHTML(c.phone) + '</td>' +
        '<td class="num">' + c.visits + '</td>' +
        '<td>' + (c.last_visit ? c.last_visit.slice(0, 10) : '-') + '</td>' +
        '<td class="num">' + c.total_spent + '</td>' +
        '</tr>';
    }).join('');
  }

  function roomCardHTML(room) {
    var statusLabel = window.fofoT(room.status);
    var body;
    if (room.status === 'busy') {
      body = '<button class="btn btn-danger" data-action="end" data-id="' + room.id + '">' + window.fofoT('end') + '</button>';
    } else {
      body =
        '<div class="inline-form" hidden data-form="' + room.id + '">' +
          '<input type="text" placeholder="' + window.fofoT('clientName') + '" data-field="name" />' +
          '<input type="tel" placeholder="' + window.fofoT('clientPhone') + '" data-field="phone" />' +
          '<div class="row">' +
            '<button class="btn btn-accent" data-action="confirm" data-id="' + room.id + '">' + window.fofoT('confirm') + '</button>' +
            '<button class="btn" data-action="cancel" data-id="' + room.id + '">' + window.fofoT('cancel') + '</button>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-accent" data-action="start" data-id="' + room.id + '" data-cta="' + room.id + '">' + window.fofoT('start') + '</button>';
    }
    return (
      '<div class="card room" data-room="' + room.id + '">' +
        '<div class="room-top"><strong>' + escapeHTML(room.name) + '</strong><span class="badge">' + room.ps_type + '</span></div>' +
        '<span class="pill ' + room.status + '">' + statusLabel + '</span>' +
        '<div>' + room.hourly_rate + ' / hr</div>' +
        body +
      '</div>'
    );
  }

  async function loadRooms() {
    var res = await window.fofoApi.get('/api/rooms');
    if (!res.ok) return;
    document.getElementById('roomsGrid').innerHTML = res.data.map(roomCardHTML).join('');
  }

  async function refreshAll() {
    await loadRooms();
    await loadStats();
    await loadClients();
  }

  document.getElementById('roomsGrid').addEventListener('click', async function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var id = btn.getAttribute('data-id');

    if (action === 'start') {
      document.querySelector('[data-cta="' + id + '"]').hidden = true;
      document.querySelector('[data-form="' + id + '"]').hidden = false;
    } else if (action === 'cancel') {
      document.querySelector('[data-form="' + id + '"]').hidden = true;
      document.querySelector('[data-cta="' + id + '"]').hidden = false;
    } else if (action === 'confirm') {
      var form = document.querySelector('[data-form="' + id + '"]');
      var name = form.querySelector('input[data-field="name"]').value.trim();
      var phone = form.querySelector('input[data-field="phone"]').value.trim();
      if (!name || !phone) return;
      await window.fofoApi.post('/api/rooms/' + id + '/start', { client_name: name, client_phone: phone });
      await refreshAll();
    } else if (action === 'end') {
      await window.fofoApi.post('/api/rooms/' + id + '/end', {});
      await refreshAll();
    }
  });

  document.getElementById('addRoomBtn').addEventListener('click', async function () {
    var name = document.getElementById('newRoomName').value.trim();
    var ps = document.getElementById('newRoomPs').value;
    var rate = Number(document.getElementById('newRoomRate').value);
    if (!name || !(rate > 0)) return;
    await window.fofoApi.post('/api/rooms', { name: name, ps_type: ps, hourly_rate: rate });
    document.getElementById('newRoomName').value = '';
    document.getElementById('newRoomRate').value = '';
    await loadRooms();
  });

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    await window.fofoApi.post('/api/auth/logout', {});
    window.location.href = '/login.html';
  });

  document.getElementById('langToggle').addEventListener('click', function () {
    var next = window.fofoGetLang() === 'ar' ? 'en' : 'ar';
    window.fofoSetLang(next);
    applyLang();
    refreshAll();
  });

  (async function init() {
    applyLang();
    var me = await requireSession();
    if (!me) return;
    await refreshAll();
  })();
})();
```

- [ ] **Step 3: Full manual end-to-end verification**

Run: `npm start`, then in a browser:
1. Open `http://localhost:3000/login.html`, sign up a new business.
2. You should land on `/index.html` showing your business name, empty rooms grid, zeroed stats, empty clients table.
3. Add a room (name, PS type, rate) — it should appear in the grid as Empty.
4. Click "Start session", fill in client name/phone, confirm — room turns Busy.
5. Click "End session" — room turns Empty, the stats tiles and clients table update with the new revenue.
6. Toggle the language button — labels switch between Arabic (RTL) and English (LTR).
7. Click "Log out" — you're returned to `/login.html`; visiting `/index.html` directly now redirects back to `/login.html`.

Expected: every step above works as described with no console errors.
Stop the server with Ctrl+C when done.

- [ ] **Step 4: Run the full automated test suite once more**

Run: `npm test`
Expected: PASS (all tests from Tasks 1-8)

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/dashboard.js
git commit -m "feat: add dashboard page with rooms, occupancy toggle, revenue, and CRM"
```

---

### Task 12: README + deployment readiness

**Files:**
- Create: `README.md`

**Interfaces:**
- No code interfaces — this task documents how to run and deploy what Tasks 1-11 built.

- [ ] **Step 1: Write README.md**

```markdown
# fofo — Phase 1

Booking and CRM platform for PlayStation lounge owners in Egypt.
Phase 1: business signup/login, room management, occupancy toggle,
automatic revenue calculation, and a basic client CRM view.

## Run locally

    npm install
    npm start

Then open http://localhost:3000/login.html

## Run tests

    npm test

## Environment variables

- `PORT` — port to listen on (default 3000).
- `FOFO_DB_PATH` — path to the SQLite database file (default `data/fofo.db`).
- `SESSION_SECRET` — secret used to sign session cookies. **Set this to
  a real random value in production** — the default is a dev-only
  placeholder.

## Deploying (Render.com free tier)

1. Push this repository to GitHub.
2. On Render.com, create a new "Web Service" from the GitHub repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add an environment variable `SESSION_SECRET` with a random value.
6. Render provides a free `https://<name>.onrender.com` URL — no
   domain purchase required to go live.

Note: Render's free tier filesystem is ephemeral on redeploy, so the
SQLite file will reset when the service redeploys. This is acceptable
for demoing Phase 1; a paid Render disk (or a hosted Postgres) is the
follow-up if persistent production data is needed.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with run and deployment instructions"
```

- [ ] **Step 3: Push everything to GitHub**

```bash
git push origin master
```

Expected: all commits from Tasks 1-12 appear on `github.com/ahmmeddmmahmmoudd/fofo`.

---

## Self-Review Notes

- **Spec coverage:** signup/login (Task 5), room management (Task 6), occupancy toggle (Task 7), revenue-per-session (Task 7/8), CRM/revenue dashboard (Task 8, 11), business isolation (Task 6 test), ar/en + RTL (Task 9-11), error handling patterns (400/401/404/409 throughout), testing (Tasks 1-8 automated, 10-11 manual browser walkthrough) — all covered.
- **Placeholder scan:** none found; every step has runnable code or an explicit manual verification procedure.
- **Type/signature consistency:** `createApp(dbPath)` (Task 1) is reused unchanged through every later task; `req.session.businessId`/`businessName` set in Task 5 are the only fields read by Tasks 6-8; response field names (`ps_type`, `hourly_rate`, `client_name`, `client_phone`, `total_spent`, etc.) are consistent between backend routes and the frontend JS that consumes them.
- **Deferred to later phases (explicitly out of scope per spec):** public customer booking page, online Paymob payments, multi-staff roles.
