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
    body: JSON.stringify({ name: 'Alpha Lounge', email: 'a@test.com', password: 'pass1234', business_type: 'gaming' })
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.email, 'a@test.com');
  assert.ok(body.id);
  ctx.close();
});

test('signup with duplicate email returns 409', async () => {
  const ctx = startApp('tmp-auth2.db');
  const payload = { name: 'A', email: 'dup@test.com', password: 'pass1234', business_type: 'gaming' };
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
    body: JSON.stringify({ name: 'A', email: 'login@test.com', password: 'pass1234', business_type: 'gaming' })
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
    body: JSON.stringify({ name: 'A', email: 'wp@test.com', password: 'pass1234', business_type: 'gaming' })
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
    body: JSON.stringify({ name: 'Alpha', email: 'me@test.com', password: 'pass1234', business_type: 'restaurant' })
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
    body: JSON.stringify({ name: 'A', email: 'lo@test.com', password: 'pass1234', business_type: 'gaming' })
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

test('signup without business_type returns 400', async () => {
  const ctx = startApp('tmp-auth8.db');
  const res = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'nobt@test.com', password: 'pass1234' })
  });
  assert.equal(res.status, 400);
  ctx.close();
});

test('signup with invalid business_type returns 400', async () => {
  const ctx = startApp('tmp-auth9.db');
  const res = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'badbt@test.com', password: 'pass1234', business_type: 'salon' })
  });
  assert.equal(res.status, 400);
  ctx.close();
});

test('gaming signup gets gaming policy defaults', async () => {
  const ctx = startApp('tmp-auth10.db');
  const res = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Gaming Biz', email: 'gaming@test.com', password: 'pass1234', business_type: 'gaming' })
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.business_type, 'gaming');
  assert.equal(body.grace_window_minutes, 60);
  assert.equal(body.deposit_required, false);
  ctx.close();
});

test('restaurant signup gets restaurant policy defaults', async () => {
  const ctx = startApp('tmp-auth11.db');
  const res = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Restaurant Biz', email: 'restaurant@test.com', password: 'pass1234', business_type: 'restaurant' })
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.business_type, 'restaurant');
  assert.equal(body.grace_window_minutes, 30);
  assert.equal(body.deposit_required, true);
  assert.equal(body.deposit_amount, 50);
  ctx.close();
});

test('signup can override policy defaults with explicit fields', async () => {
  const ctx = startApp('tmp-auth12.db');
  const res = await fetch(`${ctx.base}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Custom Biz', email: 'custom@test.com', password: 'pass1234',
      business_type: 'restaurant', grace_window_minutes: 45, deposit_amount: 75
    })
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.grace_window_minutes, 45);
  assert.equal(body.deposit_amount, 75);
  ctx.close();
});
