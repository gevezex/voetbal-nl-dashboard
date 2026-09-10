function esc(s) {
  return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render() {
  chrome.storage.local.get('poules', (d) => {
    const all = d.poules || {};
    const ids = Object.keys(all);
    const el = document.getElementById('poules');
    if (!ids.length) {
      el.innerHTML = '<p class="empty">Nog geen poules opgeslagen.<br>Open een team/poule op voetbal.nl en klik de knop.</p>';
      return;
    }
    el.innerHTML = ids
      .map((id) => {
        const p = all[id];
        const team = (p.teams || []).find((t) => t.id === p.ourTeamId) || (p.teams || [])[0];
        return (
          '<div class="row"><div><b>' + esc(p.name) + '</b>' +
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
