export function sortFestivalHistoryRecords(records = []) {
  return [...records].sort((a, b) => {
    const aInst = a?.festival_instance || {};
    const bInst = b?.festival_instance || {};
    const yearDelta = Number(bInst.in_game_year || 0) - Number(aInst.in_game_year || 0);
    if (yearDelta !== 0) return yearDelta;

    const weekDelta = Number(bInst.window_week || 0) - Number(aInst.window_week || 0);
    if (weekDelta !== 0) return weekDelta;

    const performanceTurnDelta = Number(b.performance_turn || 0) - Number(a.performance_turn || 0);
    if (performanceTurnDelta !== 0) return performanceTurnDelta;

    return new Date(b.archived_at || 0).getTime() - new Date(a.archived_at || 0).getTime();
  });
}

export function formatFestivalHistoryTiming(record) {
  const instance = record?.festival_instance;
  const year = instance?.in_game_year;
  const week = instance?.window_week;

  if (year != null && week != null) {
    return `Year ${year + 1} · Week ${week}`;
  }

  if (record?.performance_turn != null) {
    const turn = Number(record.performance_turn);
    const derivedYear = Math.floor(turn / 365) + 1;
    const derivedWeek = Math.ceil(((turn % 365) + 1) / 7);
    return `Year ${derivedYear} · Week ${derivedWeek}`;
  }

  if (record?.archived_at) {
    return new Date(record.archived_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  return '';
}
