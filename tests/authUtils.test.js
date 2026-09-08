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
