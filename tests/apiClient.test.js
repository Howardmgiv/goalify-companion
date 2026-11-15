'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { ApiClient, baseUrl, MAX_RESPONSE } = require('../lib/apiClient');
const response = (data, status = 200, headers = { 'Content-Type': 'application/json' }) => new Response(data === null ? null : typeof data === 'string' ? data : JSON.stringify(data), { status, headers });
test('accepts 201 and duplicate 200, without changing batch ID', async () => {
  const calls = []; let n = 0; const client = new ApiClient(async (url, opts) => { calls.push({ url, opts }); return ++n === 1 ? response({ status: 'accepted', accepted: 1, rejected: 0 }, 201) : response({ status: 'duplicate' }); });
  const payload = { batch_id: 'same' }; assert.equal((await client.send(payload, 'secret')).status, 'accepted'); assert.equal((await client.send(payload, 'secret')).status, 'duplicate');
  assert.equal(calls[0].opts.body, calls[1].opts.body); assert.equal(calls[0].opts.redirect, 'error');
});
test('reports authorization and rate limit errors', async () => {
  for (const status of [401, 429]) { const c = new ApiClient(async () => response({ error: 'bad' }, status)); await assert.rejects(c.send({}, 'secret'), e => e.status === status); }
});
test('rejects oversized and non-JSON responses', async () => {
  const big = new ApiClient(async () => response('a', 200, { 'content-type': 'application/json', 'content-length': String(MAX_RESPONSE + 1) })); await assert.rejects(big.status(), /too large/);
  const nonJson = new ApiClient(async () => response('<html>', 200, { 'content-type': 'text/html' })); await assert.rejects(nonJson.status(), /non-JSON/);
  const malformed = new ApiClient(async () => response('{broken', 200)); await assert.rejects(malformed.status(), /invalid JSON/);
  const stream = new ApiClient(async () => response('x'.repeat(MAX_RESPONSE + 1), 200)); await assert.rejects(stream.status(), /too large/);
});
test('limits development API override to trusted HTTPS or localhost', () => {
  assert.equal(baseUrl('http://127.0.0.1:8000/api'), 'http://127.0.0.1:8000/api');
  for (const url of ['http://example.com', 'https://evil.example', 'https://goalify.griffify.com.evil.example', 'https://user:pass@goalify.griffify.com']) assert.throws(() => baseUrl(url));
});
