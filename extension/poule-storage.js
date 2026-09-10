/** Shared by the service worker; all storage writes run through its queue. */
const PouleStorage = (() => {
  function key(p, fallback) {
    // Incomplete legacy records remain separate rather than guessing their identity.
    if (!p.ourTeamId || !p.season || !(p.competitionSlug || p.competition)) return fallback;
    return 'poule:' + JSON.stringify([
      p.ourTeamId, p.season, p.competitionSlug || p.competition,
    ]);
  }

  function timestamp(p, id) {
    const date = Date.parse(p.updatedAt);
    if (Number.isFinite(date)) return date;
    return Number((id.match(/-(\d{13})$/) || [])[1]) || 0;
  }

  function merge(stored, incoming) {
    const poules = {};
    const aliases = { ...(stored.pouleAliases || {}) };
    for (const [oldId, p] of Object.entries(stored.poules || {})) {
      const id = key(p, oldId);
      if (oldId !== id) aliases[oldId] = id;
      if (!poules[id] || timestamp(p, oldId) >= timestamp(poules[id], poules[id].id)) {
        poules[id] = { ...p, id, updatedAt: p.updatedAt || (timestamp(p, oldId) ? new Date(timestamp(p, oldId)).toISOString() : p.updatedAt) };
      }
    }
    let pouleId;
    if (incoming) {
      pouleId = key(incoming, incoming.id);
      if (!poules[pouleId] || timestamp(incoming, incoming.id) >= timestamp(poules[pouleId], pouleId)) {
        poules[pouleId] = { ...incoming, id: pouleId };
      }
    }
    return { poules, pouleAliases: aliases, pouleId };
  }
  return { merge };
})();
