function esc(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render() {
  chrome.runtime.sendMessage({ type: 'get-poules' }, (d) => {
    if (chrome.runtime.lastError || !d || d.error) {
      document.getElementById('poules').textContent = 'Dashboards laden mislukt. Probeer opnieuw.';
      return;
    }
    const all = d.poules || {};
    const ids = Object.keys(all).sort((a, b) => (Date.parse(all[b].updatedAt) || 0) - (Date.parse(all[a].updatedAt) || 0));
    document.getElementById('clear-poules').disabled = ids.length === 0;
    const el = document.getElementById('poules');
    if (!ids.length) {
      el.innerHTML = '<p class="empty">Nog geen poules opgeslagen.<br>Open een team/poule op voetbal.nl en klik de knop.</p>';
      return;
    }
    el.innerHTML = ids
      .map((id) => {
        const p = all[id];
        const date = new Date(p.updatedAt);
        const updated = Number.isFinite(date.getTime())
          ? date.toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'onbekend';
        return (
          '<div class="row"><div><b>' + esc(p.name) + '</b>' +
          '<div class="sub">' + esc(p.season) + ' · Bijgewerkt: ' + esc(updated) + '</div>' +
          '<div class="sub">' + (p.teams || []).length + ' teams · ' + (p.matches || []).length + ' wedstrijden</div>' +
          '</div><button data-id="' + esc(id) + '">Open →</button></div>'
        );
      })
      .join('');
    el.querySelectorAll('button').forEach((b) => {
      b.onclick = () => chrome.runtime.sendMessage({ type: 'open-dashboard', pouleId: b.dataset.id });
    });
  });
}

const toggle = document.getElementById('dashboard-enabled');
const status = document.getElementById('status');
function showEnabled(enabled) {
  toggle.checked = enabled;
  document.getElementById('enabled-hint').textContent = enabled
    ? 'Aan — blijft aan totdat je hem uitzet.'
    : 'Uit — de knop en het menu op voetbal.nl zijn verborgen.';
}
chrome.storage.local.get('dashboardEnabled', (data) => {
  if (chrome.runtime.lastError) { status.textContent = 'Instelling laden mislukt. Open de popup opnieuw.'; return; }
  showEnabled(data.dashboardEnabled !== false);
  toggle.disabled = false;
});
toggle.onchange = () => {
  const enabled = toggle.checked;
  toggle.disabled = true;
  chrome.storage.local.set({ dashboardEnabled: enabled }, () => {
    toggle.disabled = false;
    if (chrome.runtime.lastError) {
      showEnabled(!enabled);
      status.textContent = 'Instelling opslaan mislukt. Probeer opnieuw.';
      return;
    }
    showEnabled(enabled);
    status.textContent = '';
  });
};
document.getElementById('clear-poules').onclick = () => {
  document.getElementById('clear-poules').disabled = true;
  chrome.runtime.sendMessage({ type: 'clear-poules' }, (response) => {
    const error = chrome.runtime.lastError?.message || response?.error;
    status.textContent = error || !response ? 'Verwijderen mislukt. Probeer opnieuw.' : 'Alle opgeslagen dashboards zijn verwijderd.';
    render();
  });
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.dashboardEnabled) showEnabled(changes.dashboardEnabled.newValue !== false);
  if (changes.poules) render();
});
render();
