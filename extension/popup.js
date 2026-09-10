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

render();
