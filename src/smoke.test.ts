import { test } from 'node:test';
import assert from 'node:assert/strict';

// These guard the platform + dependency contracts the bot depends on. If a Node
// upgrade removed the global fetch, changed how a URLSearchParams body is
// encoded, or a mysql2 major renamed its entry points, these fail loudly — which
// is the whole point of running them on every dependency bump in CI.

test('the Node runtime provides the Web APIs the bot uses natively (Node >= 18)', () => {
  assert.equal(typeof fetch, 'function', 'global fetch (undici) must exist — the bot dropped node-fetch');
  assert.equal(typeof Response, 'function');
  assert.equal(typeof Headers, 'function');
  assert.equal(typeof URLSearchParams, 'function');
});

test('native fetch auto-sets the urlencoded Content-Type for a URLSearchParams body', () => {
  // xenforoWrapper relies on this platform behaviour instead of setting the
  // header itself. Build a Request the same way and assert it still holds.
  const req = new Request('https://example.test/', {
    method: 'POST',
    body: new URLSearchParams({ a: 'b' }),
  });
  assert.match(req.headers.get('content-type') ?? '', /application\/x-www-form-urlencoded/);
});

test('mysql2/promise still exposes the connection API db.ts uses', async () => {
  const mod: any = await import('mysql2/promise');
  const mysql = mod.default ?? mod;
  assert.equal(typeof mysql.createConnection, 'function', 'db.ts calls mysql.createConnection');
  assert.equal(typeof mysql.createPool, 'function');
});
