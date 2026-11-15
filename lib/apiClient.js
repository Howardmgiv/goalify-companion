'use strict';
const { API_BASE } = require('./config');
const MAX_RESPONSE = 1024 * 1024;
function baseUrl(override) {
  if (!override) return API_BASE;
  let u; try { u = new URL(override); } catch { throw new Error('Invalid GOALIFY_API_BASE'); }
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  if (!((u.protocol === 'https:' && (local || u.hostname === new URL(API_BASE).hostname)) || (u.protocol === 'http:' && local)) || u.username || u.password || u.search || u.hash) throw new Error('Unsafe GOALIFY_API_BASE');
  return u.href.replace(/\/$/, '');
}
class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
class ApiClient {
  constructor(fetch, override) { this.fetch = fetch; this.base = baseUrl(override); }
  async request(method, route, body, token) {
    if (!['/status', '/installs', '/batches', '/installs/me/credit', '/installs/me'].includes(route)) throw new Error('Invalid API endpoint');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await this.fetch(this.base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: controller.signal });
      const length = response.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE)) throw new ApiError('Server response is too large', response.status);
      let total = 0, chunks = [];
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          total += value.byteLength;
          if (total > MAX_RESPONSE) { await reader.cancel(); throw new ApiError('Server response is too large', response.status); }
          chunks.push(Buffer.from(value));
        }
      }
      let data = null;
      if (total) {
        if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new ApiError('Server returned non-JSON data', response.status);
        try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { throw new ApiError('Server returned invalid JSON', response.status); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('Server returned invalid JSON', response.status);
      }
      if (!response.ok) {
        const messages = { 401: 'Authorization failed. Delete local data and register again.', 413: 'The batch is too large.', 429: 'The service is busy. Please try again later.', 503: 'Sharing is temporarily paused.' };
        throw new ApiError(messages[response.status] || `Service request failed (${response.status}).`, response.status);
      }
      return { status: response.status, data };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(e.name === 'AbortError' ? 'The request timed out. Please try again.' : 'Unable to reach the service. Check your connection and try again.');
    } finally { clearTimeout(timer); }
  }
  async status() {
    const r = await this.request('GET', '/status');
    if (r.status !== 200 || r.data?.api !== 1 || typeof r.data.uploads_enabled !== 'boolean' || !Number.isSafeInteger(r.data.max_records_per_batch) || r.data.max_records_per_batch < 1) throw new ApiError('Server returned an invalid status response');
    return r.data;
  }
  async register() {
    const r = await this.request('POST', '/installs', { companion_version: '0.1.0' });
    if (r.status !== 201 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.data?.install_id || '') || typeof r.data?.token !== 'string' || r.data.token.length < 1 || r.data.token.length > 4096 || /[\r\n]/.test(r.data.token)) throw new ApiError('Server returned an invalid registration response');
    return r.data;
  }
  async send(payload, token) {
    const r = await this.request('POST', '/batches', payload, token);
    if (r.status === 200 && r.data?.status === 'duplicate') return r.data;
    if (r.status === 201 && r.data?.status === 'accepted' && Number.isSafeInteger(r.data.accepted) && r.data.accepted >= 0 && Number.isSafeInteger(r.data.rejected) && r.data.rejected >= 0) return r.data;
    throw new ApiError('Server returned an invalid batch response');
  }
  async credit(name, token) {
    const r = await this.request('PUT', '/installs/me/credit', { display_name: name }, token);
    if (r.status !== 200 || r.data?.display_name !== name) throw new ApiError('Server returned an invalid credit response');
  }
  async delete(token) {
    const r = await this.request('DELETE', '/installs/me', undefined, token);
    if (r.status !== 204 || r.data !== null) throw new ApiError('Server returned an invalid deletion response');
  }
}
module.exports = { ApiClient, ApiError, baseUrl, MAX_RESPONSE };
