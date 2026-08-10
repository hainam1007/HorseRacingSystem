const isFiniteNumber = (value) => Number.isFinite(Number(value));

export function adaptRaceScript(payload, expectedRaceId) {
  if (!payload || payload.race_id !== expectedRaceId) {
    throw new Error("Race script does not belong to the active race.");
  }
  if (!Number.isInteger(payload.script_version) || payload.script_version < 1) {
    throw new Error("Race script version is missing or unsupported.");
  }
  if (!isFiniteNumber(payload.duration_ms) || payload.duration_ms <= 0 || !isFiniteNumber(payload.track_length) || payload.track_length <= 0) {
    throw new Error("Race script timing or track length is invalid.");
  }
  if (!Array.isArray(payload.horses) || payload.horses.length === 0) {
    throw new Error("The race viewer requires at least one horse.");
  }
  if (payload.horses.length > 8) {
    throw new Error("The race viewer supports a maximum of 8 horses.");
  }

  const horseIds = new Set();
  const lanes = new Set();
  const durationMs = Number(payload.duration_ms);
  const trackLength = Number(payload.track_length);
  const horses = payload.horses.map((horse) => {
    if (!horse?.horse_id || horseIds.has(horse.horse_id)) throw new Error("Race script contains duplicate or missing horse IDs.");
    if (!Number.isInteger(horse.lane) || lanes.has(horse.lane)) throw new Error("Race script contains duplicate or invalid lanes.");
    if (!Array.isArray(horse.checkpoints) || horse.checkpoints.length < 2) throw new Error(`Race script checkpoints are missing for ${horse.name || horse.horse_id}.`);
    horseIds.add(horse.horse_id);
    lanes.add(horse.lane);

    let previousTime = -1;
    let previousDistance = -1;
    const checkpoints = horse.checkpoints.map((checkpoint) => {
      const timeMs = Number(checkpoint.time_ms);
      const distance = Number(checkpoint.distance);
      if (!Number.isFinite(timeMs) || !Number.isFinite(distance)) throw new Error("Race script checkpoint values must be numeric.");
      if (timeMs <= previousTime || timeMs < 0 || timeMs > durationMs) throw new Error("Race script checkpoint times must increase within the race duration.");
      if (distance < previousDistance || distance < 0 || distance > trackLength) throw new Error("Race script distances must increase within the track length.");
      previousTime = timeMs;
      previousDistance = distance;
      return { distance, timeMs };
    });

    if (checkpoints[0].timeMs !== 0 || checkpoints[0].distance !== 0) throw new Error("Every horse requires a zero-time starting checkpoint.");
    const finalCheckpoint = checkpoints.at(-1);
    if (finalCheckpoint.distance !== trackLength) throw new Error("Every horse requires a complete finish checkpoint.");

    return {
      color: horse.color || "#eee7d4",
      horseId: horse.horse_id,
      lane: horse.lane,
      name: horse.name || horse.horse_id,
      checkpoints,
      finishTimeMs: finalCheckpoint.timeMs,
    };
  });

  const startsAt = new Date(payload.starts_at).getTime();
  if (!Number.isFinite(startsAt)) throw new Error("Race script start time is invalid.");

  return { durationMs, horses, raceId: payload.race_id, startsAt, trackLength };
}
