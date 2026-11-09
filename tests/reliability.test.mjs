import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const marker = 'async function ' + name + '(';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, 'Missing function in index.html: ' + name);
  const open = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i], next = html[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('Unclosed function body: ' + name);
}

const apiSource = extractFunction('apiFetch');
const retrySource = extractFunction('retrySafeGet');

function makeContext(overrides = {}) {
  const context = {
    API: 'https://example.test/api/v2',
    ANON_KEY: 'test-anon',
    CLIENT_AGENT: 'AI-Animator-Test',
    URL, Headers, AbortController, Response, Promise, Error, Object, Number, String, JSON, Math,
    setTimeout, clearTimeout,
    fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ...overrides
  };
  vm.createContext(context);
  return context;
}

test('apiFetch keeps relative API routes under the configured API base path', async () => {
  let requestedUrl = '';
  const context = makeContext({
    fetch: async (url, init) => {
      requestedUrl = String(url);
      assert.equal(init.headers.get('apikey'), 'test-anon');
      return new Response(JSON.stringify({ result: 7 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  vm.runInContext(apiSource, context);
  const result = await context.apiFetch('/generate/text/status/abc');
  assert.equal(result.result, 7);
  assert.equal(requestedUrl, 'https://example.test/api/v2/generate/text/status/abc');
});

test('apiFetch rejects path traversal outside the API base', async () => {
  let called = false;
  const context = makeContext({ fetch: async () => { called = true; return new Response('{}'); } });
  vm.runInContext(apiSource, context);
  await assert.rejects(context.apiFetch('../../outside'), /مسیر درخواست سرویس معتبر نیست/);
  assert.equal(called, false);
});

test('apiFetch classifies rate-limit responses and preserves Retry-After', async () => {
  const context = makeContext({
    fetch: async () => new Response(JSON.stringify({ message: 'slow down' }), {
      status: 429, headers: { 'content-type': 'application/json', 'retry-after': '3' }
    })
  });
  vm.runInContext(apiSource, context);
  await assert.rejects(context.apiFetch('/status/models'), error => {
    assert.equal(error.code, 'RATE_LIMIT');
    assert.equal(error.retryable, true);
    assert.equal(error.retryAfterMs, 3000);
    return true;
  });
});

test('retrySafeGet retries only up to its clamped maximum and marks recovery state', async () => {
  let calls = 0;
  const context = makeContext({
    apiFetch: async () => {
      calls++;
      const error = new Error('temporary');
      error.status = 503;
      error.retryable = true;
      throw error;
    },
    setTimeout: callback => { callback(); return 1; },
    clearTimeout: () => {},
    Math: { ...Math, random: () => 0 }
  });
  vm.runInContext(retrySource, context);
  await assert.rejects(context.retrySafeGet('/status/models', 9), error => {
    assert.equal(error.recoverableRequest, true);
    return true;
  });
  assert.equal(calls, 3);
});

test('retrySafeGet succeeds after one transient failure', async () => {
  let calls = 0;
  const context = makeContext({
    apiFetch: async () => {
      calls++;
      if (calls === 1) {
        const error = new Error('temporary');
        error.status = 502;
        error.retryable = true;
        throw error;
      }
      return { done: true };
    },
    setTimeout: callback => { callback(); return 1; },
    clearTimeout: () => {},
    Math: { ...Math, random: () => 0 }
  });
  vm.runInContext(retrySource, context);
  const result = await context.retrySafeGet('/status/models', 2);
  assert.equal(result.done, true);
  assert.equal(calls, 2);
});
