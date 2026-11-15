'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, MAX_FILE } = require('../lib/luaParser');
test('parses SavedVariables literals, escapes, keys, comments and numbers', () => {
  const data = parse(`-- comment\nGoalifyDB = { ["Settings"] = { CommunitySharing = true }, [17] = { 'a\\n\\"b', -1.5e+2, nil, false }, foo = "a\\065\\x42", } -- [1]\nOther = 3`);
  assert.equal(data.GoalifyDB.Settings.CommunitySharing, true);
  assert.equal(data.GoalifyDB[17][1], 'a\n"b'); assert.equal(data.GoalifyDB[17][2], -150);
  assert.equal(data.GoalifyDB.foo, 'aAB'); assert.equal(data.Other, 3);
  assert.equal(Object.getPrototypeOf(data.GoalifyDB), null);
});
test('rejects executable Lua and malicious input', () => {
  for (const text of ['GoalifyDB = os.execute("x")', 'GoalifyDB = function() end', 'GoalifyDB = {x = print(1)}', 'GoalifyDB = {x=1} os.execute("x")', 'GoalifyDB = { x = 1 + 2 }']) assert.throws(() => parse(text));
});
test('prototype keys are ordinary data', () => {
  const data = parse('GoalifyDB = { ["__proto__"] = { polluted = true }, constructor = "safe" }');
  assert.equal(data.GoalifyDB.__proto__.polluted, true); assert.equal({}.polluted, undefined); assert.equal(data.GoalifyDB.constructor, 'safe');
});
test('enforces input, string and nesting limits', () => {
  assert.throws(() => parse('x=' + '{'.repeat(65) + '}'.repeat(65)), /nesting/);
  assert.doesNotThrow(() => parse('x=' + '{'.repeat(64) + '}'.repeat(64)));
  assert.throws(() => parse('x="' + 'a'.repeat(65537) + '"'), /string exceeds/);
  assert.throws(() => parse(' '.repeat(MAX_FILE + 1)), /32 MB/);
});
test('enforces total values limit', () => {
  assert.throws(() => parse('x={' + '0,'.repeat(2_000_000) + '}'), /too many values/);
});
