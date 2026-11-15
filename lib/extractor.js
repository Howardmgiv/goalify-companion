'use strict';
const { randomUUID, createHash } = require('node:crypto');
const MAX_BYTES = 2 * 1024 * 1024;
const values = v => v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : [];
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : Object.create(null);
const text = (v, max = 64) => typeof v === 'string' && v.length >= 1 && [...v].length <= max && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
const integer = (v, min = 0) => Number.isSafeInteger(v) && v >= min;
const id = v => integer(v, 1);
const iconId = v => Number.isSafeInteger(v) && v >= 1 && v <= 2147483647 ? v : null;
const COMPANION_VERSION = require('../package.json').version;
const optionalName = v => v == null ? null : text(v) ? v : undefined;
// Character and realm names known to this SavedVariables file. Any text field that contains one is
// treated as a possible identity leak (e.g. another addon writing a player name into an NPC name).
function identityNames(db) {
  const tokens = new Set(), phrases = new Set();
  const addName = v => { if (typeof v === 'string' && v.trim()) tokens.add(v.trim().toLowerCase()); };
  const addRealm = v => { if (typeof v === 'string' && v.trim()) { const r = v.trim().toLowerCase(); phrases.add(r); phrases.add(r.replace(/[\s'-]+/g, '')); } };
  for (const [key, raw] of Object.entries(obj(db.Characters))) {
    const c = obj(raw);
    addName(c.Name); addRealm(c.Realm);
    const dash = key.indexOf('-');
    if (dash > 0) { addName(key.slice(0, dash)); addRealm(key.slice(dash + 1)); }
  }
  return { tokens, phrases };
}
function leaks(value, identity) {
  if (typeof value !== 'string') return false;
  const lower = value.toLowerCase();
  if (lower.split(/[^\p{L}\p{N}]+/u).some(token => identity.tokens.has(token))) return true;
  for (const phrase of identity.phrases) if (phrase && lower.includes(phrase)) return true;
  return false;
}
function locations(...tables) {
  const identity = this && this.identity;
  const out = [], seen = new Set();
  for (const entry of tables.flatMap(values)) {
    const v = obj(entry), map = v.MapID, zone = v.Zone == null ? null : v.Zone;
    if (!id(map) || !text(zone) || (identity && leaks(zone, identity))) continue;
    const x = v.X == null ? null : v.X, y = v.Y == null ? null : v.Y;
    if (!((x === null && y === null) || (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100 && typeof y === 'number' && Number.isFinite(y) && y >= 0 && y <= 100))) continue;
    const loc = { map_id: map, zone, x, y }, key = JSON.stringify(loc);
    if (!seen.has(key)) { seen.add(key); out.push(loc); if (out.length === 16) return out; }
  }
  return out;
}
const fingerprint = (type, record) => createHash('sha256').update(type).update(JSON.stringify(record)).digest('hex');
function extract(db, { locale = 'unknown', watermark = 0, partialTime = null, partialHashes = [] } = {}) {
  db = obj(db); const sources = obj(db.SourceObservations), trainers = obj(db.Trainers);
  const icons = obj(sources.Icons), identity = identityNames(db), place = (...tables) => locations.apply({ identity }, tables);
  const safeName = v => { const n = optionalName(v); return n && leaks(n, identity) ? null : n; };
  const result = { addon_version: text(db.AddonVersion) ? db.AddonVersion : 'unknown', locale: /^(?:[a-z]{2}[A-Z]{2}|unknown)$/.test(locale) ? locale : 'unknown', vendors: [], loot: [], trainers: [] };
  const seenPartial = new Set(partialHashes);
  function add(type, r) {
    if (!integer(r.last_seen, 1) || r.last_seen <= watermark || (r.last_seen === partialTime && seenPartial.has(fingerprint(type, r)))) return;
    result[type].push(r);
  }
  if (sources.Version === 1 && sources.Interface === 16001) {
    for (const [npcKey, vendorRaw] of Object.entries(obj(sources.Vendors))) {
      const npc = Number(npcKey), vendor = obj(vendorRaw), name = safeName(vendor.Name), loc = place(vendor.Locations);
      if (!id(npc) || name === undefined || !loc.length) continue;
      for (const raw of values(vendor.Items)) {
        const v = obj(raw), build = v.Build == null ? null : v.Build;
        if (!id(v.ItemID) || !text(v.Name) || leaks(v.Name, identity) || !integer(v.PackSize, 1) || !integer(v.PackCopper) || typeof v.ExtendedCost !== 'boolean' || ![-1, 0, 1].includes(v.Available) || (build !== null && !text(build))) continue;
        add('vendors', { npc_id: npc, npc_name: name, item_id: v.ItemID, item_name: v.Name, pack_size: v.PackSize, pack_copper: v.PackCopper, extended_cost: v.ExtendedCost, available: v.Available, icon_id: iconId(icons[v.ItemID]), last_seen: v.LastSeen, build, locations: loc });
      }
    }
    for (const [itemKey, npcs] of Object.entries(obj(sources.Loot))) {
      const item = Number(itemKey); if (!id(item)) continue;
      for (const [npcKey, raw] of Object.entries(obj(npcs))) {
        const npc = Number(npcKey), v = obj(raw), name = safeName(v.Name), loc = place(v.Sites, v.Locations);
        if (!id(npc) || name === undefined || !loc.length) continue;
        for (const [method, rawMethod] of Object.entries(obj(v.Methods))) {
          const m = obj(rawMethod), build = m.Build == null ? null : m.Build;
          if (!['Skinning', 'Loot (method unconfirmed)'].includes(method) || !integer(m.Sightings, 1) || (build !== null && !text(build))) continue;
          add('loot', { npc_id: npc, npc_name: name, item_id: item, method, sightings: m.Sightings, icon_id: iconId(icons[item]), last_seen: m.LastSeen, build, locations: loc });
        }
      }
    }
  }
  if (trainers.Version === 1) {
    for (const [key, raw] of Object.entries(obj(trainers.NPCs))) {
      const npc = Number(key), v = obj(raw), loc = place(v.Locations);
      if (!id(npc) || !text(v.Name) || leaks(v.Name, identity) || !text(v.Profession) || !['Horde', 'Alliance'].includes(v.Faction) || !loc.length) continue;
      add('trainers', { npc_id: npc, npc_name: v.Name, profession: v.Profession, faction: v.Faction, last_seen: v.LastSeen, locations: loc });
    }
  }
  return result;
}
function batch(extracted, state = {}, limit = 5000) {
  if (!integer(limit, 1) || limit > 5000) throw new Error('Invalid batch limit');
  const payload = { schema: 1, batch_id: randomUUID(), addon_version: extracted.addon_version, companion_version: COMPANION_VERSION, interface: 16001, locale: extracted.locale, vendors: [], loot: [], trainers: [] };
  const all = ['vendors', 'loot', 'trainers'].flatMap(type => extracted[type].map(record => ({ type, record }))).sort((a, b) => a.record.last_seen - b.record.last_seen);
  let selected = 0, bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  for (const { type, record } of all) {
    if (selected === limit) break;
    const added = Buffer.byteLength(JSON.stringify(record), 'utf8') + (payload[type].length ? 1 : 0);
    if (bytes + added > MAX_BYTES) break;
    payload[type].push(record); bytes += added; selected++;
  }
  if (all.length && !selected) throw new Error('A record exceeds the maximum batch size');
  if (!selected) return { payload, count: 0, next: null, remaining: 0 };
  const last = all[selected - 1].record.last_seen;
  const moreAtLast = selected < all.length && all[selected].record.last_seen === last;
  let hashes = [];
  if (moreAtLast) {
    hashes = state.partialTime === last ? [...(state.partialHashes || [])] : [];
    for (const { type, record } of all.slice(0, selected)) if (record.last_seen === last) hashes.push(fingerprint(type, record));
    hashes = [...new Set(hashes)];
  }
  return { payload, count: selected, next: { watermark: moreAtLast ? last - 1 : last, partialTime: moreAtLast ? last : null, partialHashes: hashes }, remaining: all.length - selected };
}
module.exports = { extract, batch, text, locations, fingerprint, leaks, identityNames, MAX_BYTES };
