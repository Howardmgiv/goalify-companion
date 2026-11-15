'use strict';
const $ = id => document.getElementById(id);
let selected = null, busy = false;
const message = text => { $('message').textContent = text; };
async function action(fn) {
  if (busy) return; busy = true;
  try { await fn(); } catch (e) { message(String(e.message || e).replace(/^Error invoking remote method '[^']+': Error: /, '')); }
  finally { busy = false; }
}
function clearPreview() { selected = null; $('preview-section').hidden = true; $('preview').textContent = ''; }
async function refresh() {
  const data = await window.goalify.list();
  $('root-status').textContent = data.hasRoot ? 'WoW folder selected. Account folder names are masked.' : 'No WoW folder found. Choose your World of Warcraft folder.';
  $('stop').checked = data.stopped; $('auto').checked = data.auto;
  const container = $('accounts'); container.replaceChildren();
  if (!data.accounts.length) { container.textContent = 'No Goalify account files found. Log out of WoW or use /reload, then refresh.'; return; }
  for (const account of data.accounts) {
    const box = document.createElement('div'); box.className = 'account';
    const title = document.createElement('h3'); title.textContent = account.label; box.append(title);
    const status = document.createElement('p'); status.className = account.enabled ? 'good' : 'warning'; status.textContent = account.error || (account.enabled ? 'In-game sharing enabled' : 'In-game sharing NOT enabled — enable Community Sharing in Goalify first.'); box.append(status);
    const details = document.createElement('p'); details.textContent = `${account.count} new valid records · Last sync: ${account.lastSync ? new Date(account.lastSync).toLocaleString() : 'Never'}${account.pending ? ' · Failed batch retained for retry' : ''}`; box.append(details);
    const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = account.consent; label.append(check, document.createTextNode(' I consent to share this account’s anonymous observations')); box.append(label);
    check.addEventListener('change', () => action(async () => { await window.goalify.consent(account.id, check.checked); if (!check.checked) clearPreview(); await refresh(); }));
    const button = document.createElement('button'); button.textContent = account.pending ? 'Preview retained batch' : 'Preview'; button.disabled = !account.enabled; button.addEventListener('click', () => action(async () => { const p = await window.goalify.preview(account.id); selected = account.id; $('preview').textContent = p.json; $('preview-description').textContent = `${p.count} records${p.remaining ? `; ${p.remaining} more remain after this batch` : ''}${p.retry ? ' · Retry of previous batch (same ID)' : ''}.`; $('preview-section').hidden = false; $('preview-section').scrollIntoView(); message('Review the exact JSON, then tick account consent and select Send.'); })); box.append(button); container.append(box);
  }
}
$('choose').addEventListener('click', () => action(async () => { await window.goalify.choose(); clearPreview(); await refresh(); }));
$('refresh').addEventListener('click', () => action(async () => { clearPreview(); await refresh(); message('Accounts refreshed.'); }));
$('send').addEventListener('click', () => action(async () => { if (!selected) return; let result; try { result = await window.goalify.send(selected); } catch (e) { await refresh(); throw e; } message(`Batch ${result.status}${result.rejected ? `; ${result.rejected} records rejected by the service` : ''}${result.remaining ? `; ${result.remaining} records remain` : ''}.`); clearPreview(); await refresh(); }));
$('stop').addEventListener('change', () => action(async () => { await window.goalify.stop($('stop').checked); clearPreview(); await refresh(); }));
$('auto').addEventListener('change', () => action(async () => { await window.goalify.auto($('auto').checked); await refresh(); }));
$('privacy').addEventListener('click', () => action(() => window.goalify.external('https://goalify.griffify.com/privacy-policy.html')));
$('save-credit').addEventListener('click', () => action(async () => { await window.goalify.credit($('credit').value); message('Contributor display name saved.'); }));
$('clear-credit').addEventListener('click', () => action(async () => { await window.goalify.credit(null); $('credit').value = ''; message('Contributor credit removed.'); }));
$('delete').addEventListener('click', () => action(async () => { if (!window.confirm('Delete this install and all observations it shared? This cannot be undone.')) return; await window.goalify.deleteData(); clearPreview(); await refresh(); message('Shared data deleted and local credentials cleared.'); }));
window.goalify.onUpdate(text => { message(text); action(refresh); });
action(refresh);
