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
  const limited = fixture(); limited.SourceObservations.Vendors[10].Items['20:1'].Available = 5;
  assert.equal(extract(limited).vendors[0].available, 5, 'limited vendor stock greater than one is still exported');
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
test('removes text that matches the account own character or realm names', () => {
  const db = fixture();
  db.Characters = { 'Kisskaya-Myrealm': { Name: 'Kisskaya', Realm: 'My Realm' } };
  db.SourceObservations.Vendors[10].Name = 'Kisskaya';
  db.SourceObservations.Vendors[10].Items['21:1'] = { ...db.SourceObservations.Vendors[10].Items['20:1'], ItemID: 21, Name: 'Gift for my realm friends' };
  db.SourceObservations.Loot[20][10].Name = 'Alice MyRealm';
  db.SourceObservations.Loot[20][10].Sites = { a: { ...loc(2), Zone: 'kisskaya home' } };
  db.Trainers.NPCs[11].Name = 'KISSKAYA';
  db.Trainers.NPCs[12] = { ...db.Trainers.NPCs[11], Name: 'Kisskayan Tailor' };
  const data = extract(db);
  assert.equal(data.vendors.length, 1, 'item whose name contains a realm is skipped');
  assert.equal(data.vendors[0].npc_name, null, 'vendor NPC name equal to a character name is dropped');
  assert.equal(data.loot[0].npc_name, null, 'realm name inside an NPC name is dropped');
  assert.deepEqual(data.loot[0].locations.map(l => l.map_id), [1], 'zone containing a character name is dropped');
  assert.deepEqual(data.trainers.map(t => t.npc_id), [12], 'trainer named after a character is skipped; partial word matches are kept');
  assert.doesNotMatch(JSON.stringify(data), /kisskaya\b|my ?realm/i);
});test('sends numeric icon IDs only, null otherwise', () => {
  const db = fixture(); db.SourceObservations.Icons = { 20: 133001 };
  const data = extract(db);
  assert.equal(data.vendors[0].icon_id, 133001); assert.equal(data.loot[0].icon_id, 133001);
  for (const bad of ['Interface\\Icons\\x', -5, 0, 2 ** 31, 1.5]) { db.SourceObservations.Icons = { 20: bad }; assert.equal(extract(db).vendors[0].icon_id, null); }
  assert.equal(extract(fixture()).loot[0].icon_id, null);
});
test('exports source facts without training owner, status, or private flight paths', () => {
  const db = fixture();
  db.Characters = { 'SecretHero-SecretRealm': { Name: 'SecretHero', Realm: 'SecretRealm', FlightPaths: { 99: true } } };
  db.GuardDirectory = {
    Repairs: { 10: true }, Classes: { 11: { Name: 'Old Trainer', Class: 'Mage', Locations: { 1: loc() } } },
    Services: { 20: { Name: 'A'.repeat(100), Roles: { Banker: true }, Labels: { Reagents: true, SecretHero: true }, Locations: { 1: loc() }, LastSeen: 20, Build: '70888' } },
    Guards: { 21: { Name: 'Guard', Locations: { 1: loc() }, LastSeen: 21, Build: '70888', Topics: { a: { Service: 'transport', Detail: 'Mulgore' } } } },
    Directions: {
      '1:0:Dock': { PoiID: 0, Name: 'Dock', ReporterNPC: 21, ReporterName: 'Guard', Location: loc(1, 80), Service: 'transport', Detail: 'Mulgore', LastSeen: 22, Build: '70888' },
      '1:0:Mage': { PoiID: 0, Name: 'Mage Hall', ReporterNPC: 21, ReporterName: 'Guard', Location: loc(1, 60), Service: 'class', Detail: 'Mage', LastSeen: 23, Build: '70888' },
    },
    Training: { 'SecretHero-SecretRealm': { 22: { Name: 'Trainer', Location: loc(), ObservedAt: 23, Offers: { x: { Name: 'Spell', Rank: '', Cost: 100, Status: 'SECRET_STATUS', SpellID: 55 } } } } },
  };
  db.TravelSources = { Version: 1, Interface: 16001, FlightNodes: { 4: { Name: 'Flight node', Locations: { 1: loc() }, LastSeen: 24, Build: '70888' } }, FlightRoutes: { '4:5': { From: 4, To: 5, LastSeen: 25, Build: '70888' } } };
  const out = extract(db);
  assert.equal(out.services.length, 4);
  assert.equal(out.services.find(r => r.category === 'topic').detail, 'Mulgore');
  assert.equal(out.directions[0].reporter_npc, 21);
  assert.equal(out.directions.length, 2, 'distinct native zero-ID destinations are retained');
  assert.ok(out.directions.every(r => r.poi_id === 0));
  assert.equal(out.directions[0].locations[0].x, 80);
  assert.equal(out.training[0].spell_id, 55);
  assert.equal(out.flights[0].node_id, 4);
  assert.doesNotMatch(JSON.stringify(batch(out).payload), /SecretHero|SecretRealm|SECRET_STATUS|FlightPaths|FlightRoutes|Old Trainer|Repairs|Classes/i);
});
test('preserves Mage and Druid directions sharing a positive native POI identifier', () => {
  const db = fixture();
  const common = { PoiID: 82241, Name: 'Class Hall', ReporterNPC: 21, ReporterName: 'Guard',
    Location: loc(1, 60), Service: 'class', LastSeen: 23, Build: '70888' };
  db.GuardDirectory = { Directions: {
    mage: { ...common, Detail: 'Mage' },
    druid: { ...common, Detail: 'Druid' },
  } };
  const out = extract(db);
  assert.equal(out.directions.length, 2);
  assert.deepEqual(out.directions.map(r => r.detail).sort(), ['Druid', 'Mage']);
  assert.ok(out.directions.every(r => r.poi_id === 82241 && r.name === 'Class Hall'));
  assert.equal(batch(out).payload.directions.length, 2);
});
