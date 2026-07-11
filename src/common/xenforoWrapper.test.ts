import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// xenforoWrapper reads XF_URL / XF_API_KEY once, at module-load time, so we must
// set them BEFORE importing it. A dynamic import runs after these assignments
// (unlike a hoisted static import), so the module picks up these test values.
process.env.XF_URL = 'https://forum.test';
process.env.XF_API_KEY = 'test-api-key';

const { default: xenforo } = await import('./xenforoWrapper.js');

interface FetchCall {
  url: string;
  init: any;
}

const realFetch = globalThis.fetch;

// Replace the global fetch with a stub that records the call and returns a
// native Response built from `body`/`status`. The wrapper uses the global fetch
// and native Response, so this stub exercises exactly the surface a Node/undici
// upgrade could change.
function stubFetch(body: string, status = 200): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(body, { status });
  }) as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

// Invoke one wrapper method and resolve with the (error, response, body) it
// hands to its node-style callback.
function call(method: (args: any, extra: any, cb: any) => any, args: any): Promise<{ err: any; res: any; body: any }> {
  return new Promise((resolve) => {
    method(args, '', (err: any, res: any, body: any) => resolve({ err, res, body }));
  });
}

test('getForum builds the forum-threads URL, sends the API key, and parses JSON', async () => {
  const calls = stubFetch('{"threads":[{"thread_id":1}]}');
  const { err, res, body } = await call(xenforo.getForum, { id: 5 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://forum.test/api/forums/5/threads/');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers['XF-Api-Key'], 'test-api-key');
  assert.equal(err, null);
  assert.deepEqual(body, { threads: [{ thread_id: 1 }] });
  assert.ok(res, 'the raw Response is passed through to the callback');
});

test('GET endpoints build the documented API paths', async () => {
  const cases: [(args: any, extra: any, cb: any) => any, any, string][] = [
    [xenforo.getThreads, {}, 'threads/'],
    [xenforo.getThread, { id: 10 }, 'threads/10/'],
    [xenforo.getUser, { id: 3 }, 'users/3/'],
    [xenforo.getMessage, { id: 8 }, 'posts/8/'],
    [xenforo.getForum, { id: 2 }, 'forums/2/threads/'],
  ];
  for (const [fn, args, path] of cases) {
    const calls = stubFetch('{}');
    await call(fn, args);
    assert.equal(calls[0].url, 'https://forum.test/api/' + path);
    assert.equal(calls[0].init.method, 'GET');
  }
});

test('path segments are URL-encoded so they stay a single safe segment', async () => {
  const calls = stubFetch('{}');
  await call(xenforo.getUser, { id: 'a b/c' });
  assert.equal(calls[0].url, 'https://forum.test/api/users/a%20b%2Fc/');
});

test('postMessage sends an x-www-form-urlencoded body with raw (un-pre-encoded) values', async () => {
  const calls = stubFetch('{"message":"ok"}');
  await call(xenforo.postMessage, { thread_id: 3, message: 'Hello world & <b>tags</b>' });

  assert.equal(calls[0].url, 'https://forum.test/api/posts/');
  assert.equal(calls[0].init.method, 'POST');
  assert.ok(calls[0].init.body instanceof URLSearchParams, 'body is a URLSearchParams');
  assert.equal(calls[0].init.body.get('thread_id'), '3');
  assert.equal(calls[0].init.body.get('message'), 'Hello world & <b>tags</b>');
  // URLSearchParams applies the on-the-wire encoding (spaces -> +, & -> %26, etc.):
  assert.equal(calls[0].init.body.toString(), 'thread_id=3&message=Hello+world+%26+%3Cb%3Etags%3C%2Fb%3E');
});

test('updateThread omits undefined fields from the body', async () => {
  const calls = stubFetch('{}');
  await call(xenforo.updateThread, { id: 7, prefix_id: 2, title: 'New title' });
  assert.equal(calls[0].url, 'https://forum.test/api/threads/7/');
  assert.equal(calls[0].init.body.toString(), 'prefix_id=2&title=New+title');
});

test('setThreadTag builds a custom_fields[...] parameter', async () => {
  const calls = stubFetch('{}');
  await call(xenforo.setThreadTag, { id: 4, tag_name: 'status', tag_value: 'approved' });
  assert.equal(calls[0].init.body.toString(), 'custom_fields%5Bstatus%5D=approved');
});

test('a non-JSON response (e.g. a Cloudflare HTML challenge) is surfaced as an error', async () => {
  stubFetch('<html>Attention Required</html>', 403);
  const { err, res, body } = await call(xenforo.getForum, { id: 5 });
  assert.ok(err instanceof Error);
  assert.match(err.message, /non-JSON/);
  assert.ok(res, 'the response is still passed for inspection');
  assert.equal(body, null);
});

test('an empty response body yields (null error, response, null body)', async () => {
  stubFetch('');
  const { err, res, body } = await call(xenforo.getThread, { id: 1 });
  assert.equal(err, null);
  assert.ok(res);
  assert.equal(body, null);
});

test('a network/fetch failure is passed to the callback as an error', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  const { err, res, body } = await call(xenforo.getForum, { id: 5 });
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'network down');
  assert.equal(res, null);
  assert.equal(body, null);
});

test('the callback may be passed as the second argument (2-arg call form)', async () => {
  const calls = stubFetch('{"ok":true}');
  const result = await new Promise<{ err: any; res: any; body: any }>((resolve) => {
    (xenforo.getThreads as any)({}, (err: any, res: any, body: any) => resolve({ err, res, body }));
  });
  assert.equal(calls.length, 1);
  assert.equal(result.err, null);
  assert.deepEqual(result.body, { ok: true });
});
