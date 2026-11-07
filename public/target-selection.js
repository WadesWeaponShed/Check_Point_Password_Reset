// A target is eligible only after an affirmative SIC response.
export function communicatingTargetIds(targets, sic) {
  return targets.filter(target => sic.get(target.id)?.communicating === true && sic.get(target.id)?.platformReady === true).map(target => target.id);
}
export function groupTargetsBySic(targets, sic, search = '') {
  const query = search.toLowerCase();
  const sorted = [...targets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const matches = sorted.filter(t => `${t.name} ${t.ip} ${t.cluster}`.toLowerCase().includes(query));
  const failed = t => {
    const state = sic.get(t.id);
    return state && state.communicating !== true && !['Testing…', 'Not tested'].includes(state.status);
  };
  return { available: matches.filter(t => !failed(t)), failing: matches.filter(failed) };
}
