// Run with: npm test
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createSessionToken, roleForPassword, sessionRole } from '../src/lib/session.ts';

beforeEach(() => {
  process.env.APP_PASSWORD = 'shared-pass';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.ADMIN_PASSWORD = 'admin-pass';
});

test('passwords map to roles', () => {
  assert.equal(roleForPassword('shared-pass'), 'user');
  assert.equal(roleForPassword('admin-pass'), 'admin');
  assert.equal(roleForPassword('wrong'), null);
});

test('without ADMIN_PASSWORD nobody gets admin', () => {
  delete process.env.ADMIN_PASSWORD;
  assert.equal(roleForPassword('admin-pass'), null);
  assert.equal(roleForPassword('shared-pass'), 'user');
});

test('tokens keep their role and reject tampering', () => {
  const user = createSessionToken('user');
  const admin = createSessionToken('admin');
  assert.equal(sessionRole(user), 'user');
  assert.equal(sessionRole(admin), 'admin');

  const [expires, , signature] = user.split('.');
  assert.equal(sessionRole(`${expires}.admin.${signature}`), null, 'promoting a user token to admin must fail');
  assert.equal(sessionRole('garbage'), null);
  assert.equal(sessionRole(undefined), null);
});

test('expired tokens are rejected', () => {
  const token = createSessionToken('admin');
  const [, role, ] = token.split('.');
  const past = String(Date.now() - 1000);
  assert.equal(sessionRole(`${past}.${role}.${token.split('.')[2]}`), null);
});
