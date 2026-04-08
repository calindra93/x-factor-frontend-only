export function sortGreenRoomResults(results = []) {
  return [...results].sort((a, b) => {
    const aDay = Number(a?.festival_instance_day?.day_index || 0);
    const bDay = Number(b?.festival_instance_day?.day_index || 0);
    const dayDelta = aDay - bDay;
    if (dayDelta !== 0) return dayDelta;

    const turnDelta = Number(a?.resolved_turn_id || 0) - Number(b?.resolved_turn_id || 0);
    if (turnDelta !== 0) return turnDelta;

    return String(a?.festival_instance_day_id || '').localeCompare(String(b?.festival_instance_day_id || ''));
  });
}

export function formatGreenRoomClipDay(clip) {
  const dayIndex = Number(clip?.day_index || 0);
  return dayIndex > 0 ? `Day ${dayIndex}` : 'Day —';
}

export function selectCurrentGreenRoomInstance(instances = [], resultsMap = {}, historyRecords = []) {
  const historyByInstanceId = new Map(
    historyRecords
      .filter((record) => record?.festival_instance_id)
      .map((record) => [record.festival_instance_id, record]),
  );

  return [...instances]
    .filter((instance) => instance?.status === 'COMPLETE' && (resultsMap[instance.id]?.length || 0) > 0)
    .filter((instance) => {
      const history = historyByInstanceId.get(instance.id);
      return !history || !history.green_room_viewed_at;
    })
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())[0] || null;
}
