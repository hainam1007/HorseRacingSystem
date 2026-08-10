export function interpolateDistance(checkpoints, elapsedMs) {
  if (!checkpoints?.length || elapsedMs <= 0) return 0;
  const last = checkpoints.at(-1);
  if (elapsedMs >= last.timeMs) return last.distance;

  for (let index = 1; index < checkpoints.length; index += 1) {
    const next = checkpoints[index];
    if (elapsedMs <= next.timeMs) {
      const previous = checkpoints[index - 1];
      const segmentDuration = next.timeMs - previous.timeMs;
      const ratio = segmentDuration ? (elapsedMs - previous.timeMs) / segmentDuration : 0;
      return previous.distance + (next.distance - previous.distance) * Math.max(0, Math.min(1, ratio));
    }
  }
  return last.distance;
}

export function buildLiveRanking(horses, distances, trackLength) {
  return horses
    .map((horse) => ({
      ...horse,
      distance: distances[horse.horseId] || 0,
      progress: Math.max(0, Math.min(1, (distances[horse.horseId] || 0) / trackLength)),
    }))
    .sort((left, right) => {
      const leftFinished = left.distance >= trackLength;
      const rightFinished = right.distance >= trackLength;
      if (leftFinished && rightFinished) return left.finishTimeMs - right.finishTimeMs;
      return right.distance - left.distance || left.lane - right.lane;
    })
    .map((horse, index) => ({ ...horse, position: index + 1 }));
}

export function formatRaceTime(milliseconds) {
  const safe = Math.max(0, Number(milliseconds) || 0);
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const hundredths = Math.floor((safe % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}
