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
