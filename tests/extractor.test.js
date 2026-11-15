'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { extract, batch, locations } = require('../lib/extractor');
const loc = (n = 1, x = 25) => ({ MapID: n, Zone: 'Test Zone', X: x, Y: 40 });
function fixture() { return { AddonVersion: '0.27.0', Characters: { SECRET_CHARACTER: { Gold: 999, Mail: 'SECRET_MAIL' } }, Goals: { SECRET_GOAL: 'private' }, SourceObservations: { Version: 1, Interface: 16001, Vendors: { 10: { Name: 'Vendor', Locations: { 1: loc() }, Items: { '20:1': { ItemID: 20, Name: 'Item', PackSize: 1, PackCopper: 5, ExtendedCost: false, Available: -1, LastSeen: 100, Build: '70888', Note: 'SECRET_NOTE' } } } }, Loot: { 20: { 10: { Name: 'Vendor', Locations: { 1: loc() }, Sites: { a: loc() }, Methods: { Skinning: { LastSeen: 101, Sightings: 2, Build: '70888' } } } } } }, Trainers: { Version: 1, NPCs: { 11: { Name: 'Trainer', Profession: 'Tailoring', Faction: 'Horde', LastSeen: 102, Locations: { 1: loc() } } } } }; }
test('extracts only allowed fields and delta records', () => {
  const data = extract(fixture(), { locale: 'enUS', watermark: 100 });
  assert.equal(data.vendors.length, 0); assert.equal(data.loot.length, 1); assert.equal(data.trainers.length, 1);
  assert.equal(data.loot[0].locations.length, 1); assert.doesNotMatch(JSON.stringify(data), /SECRET|Characters|Goals|Gold|Mail|Note/);
  assert.equal(extract(fixture()).vendors.length, 1);
});
test('drops invalid fields, records and locations', () => {
  const db = fixture(); db.SourceObservations.Vendors[10].Items['20:1'].PackSize = -1;
  db.SourceObservations.Loot[20][10].Methods.Skinning.Sightings = 0;
  db.Trainers.NPCs[11].Faction = 'Neutral';
  const data = extract(db); assert.equal(data.vendors.length + data.loot.length + data.trainers.length, 0);
  assert.deepEqual(locations({ a: loc(1), b: loc(1), c: loc(2, 101), d: { MapID: 3, Zone: 'OK', X: 5 } }), [{ map_id: 1, zone: 'Test Zone', x: 25, y: 40 }]);
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i, loc(i + 1)])); assert.equal(locations(many).length, 16);
});
test('splits equal timestamps without skipping unsent records', () => {
  const db = fixture(); const item = db.SourceObservations.Vendors[10].Items['20:1'];
  db.SourceObservations.Loot = {}; db.Trainers.NPCs = {};
  for (let i = 1; i < 5; i++) db.SourceObservations.Vendors[10].Items['x' + i] = { ...item, ItemID: 20 + i };
  let state = {}, sent = [];
  for (let n = 0; n < 3; n++) { const b = batch(extract(db, state), state, 2); sent.push(...b.payload.vendors.map(x => x.item_id)); state = b.next; }
  assert.equal(new Set(sent).size, 5); assert.equal(state.watermark, 100); assert.equal(extract(db, state).vendors.length, 0);
});
