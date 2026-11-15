'use strict';

const MAX_FILE = 32 * 1024 * 1024;
const MAX_STRING = 64 * 1024;
const MAX_VALUES = 2_000_000;
const MAX_DEPTH = 64;

function parse(input) {
  if (typeof input !== 'string') throw new Error('Lua input must be text');
  if (Buffer.byteLength(input, 'utf8') > MAX_FILE) throw new Error('Lua file exceeds 32 MB');
  let i = 0, count = 0;
  const fail = message => { throw new Error(`Invalid Lua data at offset ${i}: ${message}`); };
  function skip() {
    for (;;) {
      while (/\s/.test(input[i] || '') && i < input.length) i++;
      if (input.slice(i, i + 2) !== '--') return;
      i += 2;
      const long = input.slice(i).match(/^\[(=*)\[/);
      if (long) {
        i += long[0].length;
        const end = input.indexOf(']' + long[1] + ']', i);
        if (end < 0) fail('unterminated comment');
        i = end + long[1].length + 2;
      } else {
        while (i < input.length && input[i] !== '\n' && input[i] !== '\r') i++;
      }
    }
  }
  function identifier() {
    skip();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
    if (!m) fail('expected identifier');
    i += m[0].length;
    return m[0];
  }
  function expect(ch) { skip(); if (input[i] !== ch) fail(`expected ${ch}`); i++; }
  function string() {
    const quote = input[i++]; let s = '';
    while (i < input.length) {
      const c = input[i++];
      if (c === quote) {
        if (Buffer.byteLength(s, 'utf8') > MAX_STRING) fail('string exceeds 64 KB');
        return s;
      }
      if (c === '\n' || c === '\r') fail('newline in string');
      if (c !== '\\') { s += c; if (s.length > MAX_STRING) fail('string exceeds 64 KB'); continue; }
      if (i >= input.length) fail('unterminated escape');
      const e = input[i++];
      const escapes = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\x0b', '\\': '\\', '"': '"', "'": "'" };
      if (Object.hasOwn(escapes, e)) s += escapes[e];
      else if (e === '\n') s += '\n';
      else if (e === '\r') { if (input[i] === '\n') i++; s += '\n'; }
      else if (e === 'z') { while (i < input.length && /\s/.test(input[i])) i++; }
      else if (e === 'x') {
        const h = input.slice(i, i + 2); if (!/^[\da-fA-F]{2}$/.test(h)) fail('invalid hex escape');
        s += String.fromCharCode(parseInt(h, 16)); i += 2;
      } else if (/\d/.test(e)) {
        let digits = e; while (digits.length < 3 && /\d/.test(input[i] || '')) digits += input[i++];
        const n = Number(digits); if (n > 255) fail('invalid decimal escape'); s += String.fromCharCode(n);
      } else fail('unsupported escape');
      if (s.length > MAX_STRING) fail('string exceeds 64 KB');
    }
    fail('unterminated string');
  }
  function value(depth) {
    skip(); if (++count > MAX_VALUES) fail('too many values');
    if (input[i] === '{') {
      if (depth >= MAX_DEPTH) fail('nesting exceeds 64');
      i++; const result = Object.create(null); let next = 1;
      skip();
      while (input[i] !== '}') {
        if (i >= input.length) fail('unterminated table');
        let key, v;
        if (input[i] === '[') {
          i++; skip();
          if (++count > MAX_VALUES) fail('too many values');
          if (input[i] === '"' || input[i] === "'") key = string();
          else {
            const m = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(input.slice(i));
            if (!m) fail('invalid table key'); i += m[0].length; key = Number(m[0]);
            if (!Number.isFinite(key)) fail('invalid table key');
          }
          expect(']'); expect('='); v = value(depth + 1);
        } else {
          const save = i;
          if (/[A-Za-z_]/.test(input[i] || '')) {
            const name = identifier(); skip();
            if (input[i] === '=') { if (++count > MAX_VALUES) fail('too many values'); i++; key = name; v = value(depth + 1); }
            else { i = save; key = next++; v = value(depth + 1); }
          } else { key = next++; v = value(depth + 1); }
        }
        if (v !== null) result[key] = v; else delete result[key];
        skip();
        if (input[i] === ',' || input[i] === ';') { i++; skip(); }
        else if (input[i] !== '}') fail('expected table separator');
      }
      i++; return result;
    }
    if (input[i] === '"' || input[i] === "'") return string();
    const number = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(input.slice(i));
    if (number) { i += number[0].length; const n = Number(number[0]); if (!Number.isFinite(n)) fail('invalid number'); return n; }
    const word = identifier();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'nil') return null;
    fail('only literal data is allowed');
  }
  const root = Object.create(null); skip();
  while (i < input.length) {
    const name = identifier(); expect('='); root[name] = value(0); skip();
    if (input[i] === ';') { i++; skip(); }
  }
  return root;
}
module.exports = { parse, MAX_FILE };
