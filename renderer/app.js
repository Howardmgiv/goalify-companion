'use strict';
const $ = id => document.getElementById(id);
const AUTO_EVERY = 10 * 60 * 1000, CARD_LIMIT = 100;
let selected = null, busy = false, mode = 'auto';
const message = text => { $('message').textContent = text; };
const clean = e => String(e.message || e).replace(/^Error invoking remote method '[^']+': Error: /, '');
async function action(fn) {
  if (busy) return; busy = true;
  try { await fn(); } catch (e) { message(clean(e)); }
  finally { busy = false; }
}
function clearPreview() { selected = null; $('preview-section').hidden = true; $('preview').textContent = ''; $('preview-cards').replaceChildren(); }
const el = (tag, text, className) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (className) n.className = className; return n; };
const money = c => { if (!Number.isInteger(c) || c < 0) return ''; const g = Math.floor(c / 10000), s = Math.floor(c / 100) % 100, k = c % 100; return [g && `${g}g`, s && `${s}s`, (k || (!g && !s)) && `${k}c`].filter(Boolean).join(' '); };
const where = r => (Array.isArray(r.locations) ? r.locations : []).slice(0, 3).map(l => `${l.zone || `map ${l.map_id}`}${Number.isFinite(l.x) ? ` ${l.x}, ${l.y}` : ''}`).join('; ');
const npc = r => `${r.npc_name || 'Unnamed NPC'} (NPC ${r.npc_id})`;
// Plain-language cards built with textContent only; the raw JSON stays available below them.
function renderCards(payload) {
  const groups = [
    ['Vendors', payload.vendors, r => [`${r.item_name || `Item ${r.item_id}`}${r.pack_size > 1 ? ` x${r.pack_size}` : ''} for ${money(r.pack_copper)}${r.extended_cost ? ' + other currency' : ''}`, `Sold by ${npc(r)} · ${where(r)}`]],
    ['Loot', payload.loot, r => [`Item ${r.item_id} from ${r.method}`, `${npc(r)} · seen ${r.sightings}x · ${where(r)}`]],
    ['Trainers', payload.trainers, r => [`${r.profession} trainer (${r.faction})`, `${npc(r)} · ${where(r)}`]],
  ];
  const box = el('div', null, 'cards');
  for (const [title, rows, describe] of groups) {
    if (!Array.isArray(rows) || !rows.length) continue;
    box.append(el('h3', `${title} (${rows.length})`));
    const list = el('ul');
    for (const r of rows.slice(0, CARD_LIMIT)) { const [main, meta] = describe(r); const li = el('li'); li.append(el('div', main), el('div', meta, 'meta')); list.append(li); }
    if (rows.length > CARD_LIMIT) list.append(el('li', `…and ${rows.length - CARD_LIMIT} more (see the exact data below).`, 'meta'));
    box.append(list);
  }
  $('preview-cards').replaceChildren(box);
}
async function refresh() {
  const data = await window.goalify.list();
  mode = data.sendMode === 'manual' ? 'manual' : 'auto';
  $('mode-auto').checked = mode === 'auto'; $('mode-manual').checked = mode === 'manual';
  $('root-status').textContent = data.hasRoot ? 'WoW folder selected. Account folder names are masked.' : 'No WoW folder found. Choose your World of Warcraft folder.';
  $('stop').checked = data.stopped;
  $('install-id').textContent = data.installId ? `Install ID: ${data.installId} (quote it if you ask us by email to delete your data).` : 'Not registered yet; an anonymous install ID is created on your first send.';
  const container = $('accounts'); container.replaceChildren();
  if (!data.accounts.length) { container.textContent = 'No Goalify account files found. Log out of WoW or use /reload, then refresh.'; return; }
  for (const account of data.accounts) {
    const box = el('div', null, 'account');
    box.append(el('h3', account.label));
    box.append(el('p', account.error || (account.enabled ? 'In-game sharing enabled' : 'In-game sharing NOT enabled — enable Community Sharing in Goalify first.'), account.enabled ? 'good' : 'warning'));
    box.append(el('p', `${account.count} new valid records · Last sync: ${account.lastSync ? new Date(account.lastSync).toLocaleString() : 'Never'}${account.pending ? ' · Failed batch retained for retry' : ''}`));
    const label = el('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = account.consent;
    label.append(check, document.createTextNode(mode === 'auto' ? ' I consent to share this account’s anonymous observations, sent automatically while this app is open' : ' I consent to share this account’s anonymous observations after I preview them'));
    box.append(label);
    check.addEventListener('change', () => action(async () => { await window.goalify.consent(account.id, check.checked); if (!check.checked) clearPreview(); await refresh(); if (check.checked) await autoSend(); }));
    const button = el('button', account.pending ? 'Preview retained batch' : 'Preview'); button.disabled = !account.enabled;
    button.addEventListener('click', () => action(async () => {
      const p = await window.goalify.preview(account.id); selected = account.id;
      $('preview').textContent = p.json; renderCards(JSON.parse(p.json));
      $('preview-description').textContent = `${p.count} records${p.remaining ? `; ${p.remaining} more remain after this batch` : ''}${p.retry ? ' · Retry of previous batch (same ID)' : ''}.`;
      $('preview-section').hidden = false; $('preview-section').scrollIntoView();
      message(account.consent ? 'Review the batch, then select Send.' : 'Review the batch, tick account consent, then select Send.');
    }));
    box.append(button); container.append(box);
  }
}
async function autoSend() {
  if (mode !== 'auto') return;
  const result = await window.goalify.auto();
  if (!result.ran) return;
  if (result.batches) { clearPreview(); await refresh(); }
  if (result.error) message(`Automatic send stopped: ${result.error}${result.batches ? ` (${result.records} records sent first)` : ''}. It will retry later.`);
  else if (result.batches) message(`Sent ${result.records} records automatically in ${result.batches} batch${result.batches === 1 ? '' : 'es'}.`);
}
$('choose').addEventListener('click', () => action(async () => { await window.goalify.choose(); clearPreview(); await refresh(); await autoSend(); }));
$('refresh').addEventListener('click', () => action(async () => { clearPreview(); await refresh(); message('Accounts refreshed.'); await autoSend(); }));
$('send').addEventListener('click', () => action(async () => { if (!selected) return; let result; try { result = await window.goalify.send(selected); } catch (e) { await refresh(); throw e; } message(`Batch ${result.status}${result.rejected ? `; ${result.rejected} records rejected by the service` : ''}${result.remaining ? `; ${result.remaining} records remain` : ''}.`); clearPreview(); await refresh(); }));
$('stop').addEventListener('change', () => action(async () => { await window.goalify.stop($('stop').checked); clearPreview(); await refresh(); if (!$('stop').checked) await autoSend(); }));
for (const radio of [$('mode-auto'), $('mode-manual')]) radio.addEventListener('change', () => action(async () => { await window.goalify.mode(radio.value); await refresh(); message(radio.value === 'auto' ? 'New observations will be sent automatically while this app is open.' : 'Nothing will be sent until you preview a batch and select Send.'); await autoSend(); }));
$('privacy').addEventListener('click', () => action(() => window.goalify.external('https://goalify.griffify.com/privacy-policy.html')));
$('support').addEventListener('click', () => action(() => window.goalify.external('https://buymeacoffee.com/griffifystudios')));
$('save-credit').addEventListener('click', () => action(async () => { await window.goalify.credit($('credit').value); message('Contributor display name saved.'); }));
$('clear-credit').addEventListener('click', () => action(async () => { await window.goalify.credit(null); $('credit').value = ''; message('Contributor credit removed.'); }));
$('delete').addEventListener('click', () => action(async () => { if (!window.confirm('Delete this install and all observations it shared? This cannot be undone.')) return; await window.goalify.deleteData(); clearPreview(); await refresh(); message('Shared data deleted and local credentials cleared.'); }));
action(async () => { await refresh(); await autoSend(); });
setInterval(() => action(autoSend), AUTO_EVERY);
