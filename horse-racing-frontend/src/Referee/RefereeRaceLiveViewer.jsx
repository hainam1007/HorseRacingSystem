import { useEffect, useMemo, useState } from "react";
import { refereeApi } from "../api/refereeApi";
import LoadingSkeleton from "../components/LoadingSkeleton";
import { RACE_PHASES, RACE_STATUSES } from "./refereeConstants";
import { getHorseJockeyImage } from "../pages/spectator/spectatorAdapters";
import RaceViewer2D from "../pages/spectator/live-race/RaceViewer2D";
import { useRaceViewerSession } from "../pages/spectator/live-race/useRaceViewerSession";

const RUNNER_COLORS = ["#f0a15c", "#9dd5b1", "#eee7d4", "#d96a61", "#78b9ef", "#e6b080", "#b1ebd6", "#80c4e6"];
const LIVE_STATE_REFRESH_MS = 3000;

function getId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function getJockeyName(jockey) {
  if (!jockey || typeof jockey === "string") return "Unknown Jockey";
  return jockey.user?.full_name || jockey.user_id?.full_name || jockey.full_name || jockey.name || "Unknown Jockey";
}

function getLiveStateSignature(liveState) {
  if (!liveState) return "";
  const script = liveState?.engine?.race_script;
  return JSON.stringify({
    raceStatus: liveState.race?.status,
    updatedAt: liveState.race?.updated_at,
    engineId: getId(liveState.engine),
    engineStatus: liveState.engine?.status,
    generatedAt: liveState.engine?.generated_at,
    scriptSequence: script?.sequence,
    scriptVersion: script?.script_version,
    scriptStartsAt: script?.starts_at,
    scriptDuration: script?.duration_ms,
    finishOrder: (liveState.engine?.finish_order || []).map((result) => [
      getId(result.horse_id || result.horse),
      result.position,
      result.finish_time,
    ]),
  });
}

function mapRaceEngineContenders(engine) {
  if (!engine?.finish_order?.length) return [];
  const participantsByHorse = new Map(
    (engine.participants || []).map((participant) => [
      getId(participant.horse_id || participant.horse),
      participant,
    ])
  );
  return [...engine.finish_order]
    .sort((left, right) => Number(left.position) - Number(right.position))
    .map((order, index) => {
      const horseId = getId(order.horse_id || order.horse);
      const participant = participantsByHorse.get(horseId) || {};
      const horse = participant.horse || order.horse || participant.horse_id || order.horse_id || {};
      const jockey = participant.jockey || order.jockey || participant.jockey_id || order.jockey_id || {};
      const position = Number(order.position);
      const finishTime = Number(order?.finish_time);
      if (!horseId || !Number.isInteger(position) || position < 1) return null;
      return {
        id: horseId,
        horse: horse?.name || "Unknown horse",
        jockey: getJockeyName(jockey),
        owner: horse?.owner_id?.stable_name || "Horse Owner",
        lane: participant.draw != null ? Number(participant.draw)
          : participant.lane != null ? Number(participant.lane)
          : index + 1,
        weight: horse?.weight ? `${horse.weight}kg` : "56kg",
        form: "Race Engine",
        image: getHorseJockeyImage(horseId),
        color: RUNNER_COLORS[index % RUNNER_COLORS.length],
        position,
        raceEngineFinishTimeMs: Number.isFinite(finishTime) ? Math.round(finishTime * 1000) : undefined,
      };
    })
    .filter(Boolean);
}

function mapLiveParticipantContenders(participants = []) {
  return participants.map((participant, index) => {
    const horse = participant.horse || participant.horse_id || {};
    const jockey = participant.jockey || participant.jockey_id || {};
    const horseId = getId(participant.horse_id || horse);
    return {
      id: horseId,
      horse: horse?.name || "Unknown horse",
      jockey: participant.jockey_name || getJockeyName(jockey),
      owner: participant.owner_name || participant.owner?.stable_name || participant.horse?.owner?.stable_name || "Horse Owner",
      lane: participant.lane != null ? Number(participant.lane) : index + 1,
      weight: horse?.weight ? `${horse.weight}kg` : "56kg",
      form: participant.eligible ? "Eligible" : "Pending check",
      image: getHorseJockeyImage(horseId),
      color: RUNNER_COLORS[index % RUNNER_COLORS.length],
      position: index + 1,
    };
  });
}

export default function RefereeRaceLiveViewer({ raceId, race }) {
  const [raceLiveState, setRaceLiveState] = useState(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!raceId) return undefined;
    let active = true;

    async function fetchLiveState() {
      try {
        const data = await refereeApi.getRaceLiveState(raceId);
        if (active) {
          // Avoid replacing state with a fresh object every poll when the
          // engine payload is identical — otherwise the rAF loop in
          // useRacePlayback resets to t=0 each cycle and the runner positions
          // diverge from the spectator view.
          setRaceLiveState((current) => (
            getLiveStateSignature(current) === getLiveStateSignature(data)
              ? current
              : data || null
          ));
          setHasError(false);
        }
      } catch (err) {
        if (active) setHasError(true);
      }
    }

    fetchLiveState();
    const interval = window.setInterval(fetchLiveState, LIVE_STATE_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [raceId]);

  const raceEngineContenders = useMemo(
    () => mapRaceEngineContenders(raceLiveState?.engine),
    [raceLiveState?.engine]
  );
  const liveParticipantContenders = useMemo(
    () => mapLiveParticipantContenders(raceLiveState?.participants || []),
    [raceLiveState?.participants]
  );

  // Keep a stable reference to the engine race_script so the playback rAF loop
  // does not reset on every 3s poll (it compares references inside
  // useRaceViewerSession → useRacePlayback). Without this the referee view
  // would visually snap back to t=0 each cycle while the spectator view
  // continues smoothly.
  const stableRaceScript = useMemo(
    () => raceLiveState?.engine?.race_script || null,
    [raceLiveState?.engine?.race_script]
  );

  // Mirror exactly what spectator RaceDetail.jsx does: recreate effectiveRace
  // from the current raceLiveState on every render so that useRaceViewerSession
  // sees the updated fields (raceStatus, updatedAt, engineGeneratedAt) and
  // properly re-evaluates its memoised result when the race transitions
  // between phases (pre-race → running → completed).  We only re-evaluate the
  // watcher session when the live-state payload actually changes, not on
  // every poll tick — see getLiveStateSignature + stableRaceScript above.
  const effectiveRace = raceLiveState
    ? {
        id: raceId,
        name: race?.name || `Race ${raceId}`,
        distance: race?.distance || "1,000m",
        raceStatus: raceLiveState?.race?.status || race?.status || RACE_STATUSES.SCHEDULED,
        updatedAt: raceLiveState?.race?.updated_at || null,
        engineGeneratedAt: raceLiveState?.engine?.generated_at || null,
      }
    : {
        id: raceId,
        name: race?.name || `Race ${raceId}`,
        distance: race?.distance || "1,000m",
        raceStatus: race?.status || RACE_STATUSES.SCHEDULED,
        updatedAt: null,
        engineGeneratedAt: null,
      };

  const hasRaceEngineOrder = raceEngineContenders.length > 0;
  const hasBackendParticipants = !hasRaceEngineOrder && liveParticipantContenders.length > 0;

  const contenders = useMemo(() => {
    if (hasRaceEngineOrder) return [...raceEngineContenders];
    if (hasBackendParticipants) return [...liveParticipantContenders];
    if (race?.participants?.length) {
      return race.participants
        .filter((participant) => participant.eligible)
        .map((participant, index) => ({
          id: participant.horseId,
          horse: participant.horseName,
          jockey: participant.jockeyName,
          owner: participant.owner,
          lane: participant.lane ?? (index + 1),
          weight: participant.weight ? `${participant.weight}kg` : "56kg",
          form: "Workspace preview",
          image: getHorseJockeyImage(participant.horseId),
          color: RUNNER_COLORS[index % RUNNER_COLORS.length],
          position: index + 1,
        }))
        .sort((a, b) => a.lane - b.lane);
    }
    return [];
  }, [hasRaceEngineOrder, hasBackendParticipants, raceEngineContenders, liveParticipantContenders, race?.participants]);

  const viewer = useRaceViewerSession(effectiveRace, contenders, {
    raceScript: stableRaceScript,
    useRaceEngineOrder: hasRaceEngineOrder,
  });

  const eyebrow = hasRaceEngineOrder
    ? "Race Engine 2D track"
    : hasBackendParticipants
      ? "Backend field preview"
      : "Workspace preview";
  const rankingTitle = hasRaceEngineOrder
    ? "Engine-driven running order"
    : hasBackendParticipants
      ? "Registered runners"
      : "Race-day roster";
  const statusLabel = hasError
    ? "Live data unavailable"
    : hasRaceEngineOrder
      ? "Engine order connected"
      : hasBackendParticipants
        ? "Participants connected"
        : "Awaiting race engine";

  const editable = race?.phase === RACE_PHASES.DURING_RACE;
  const isRaceLifecycleDone = [
    RACE_STATUSES.COMPLETED,
    RACE_STATUSES.CANCELLED,
  ].includes(effectiveRace.raceStatus);

  return (
    <section className="admin-panel referee-live-monitor" aria-label="Live race viewer">
      <div className="admin-panel__header">
        <p className="admin-panel__eyebrow">Live view</p>
        <h2>
          {editable ? "Live race broadcast" : isRaceLifecycleDone ? "Race broadcast (read-only)" : "Pre-race broadcast"}
        </h2>
        <small>Polled every {LIVE_STATE_REFRESH_MS / 1000}s from the race engine.</small>
      </div>

      {!contenders.length ? (
        <LoadingSkeleton ariaLabel="Loading live race broadcast" variant="inline" />
      ) : (
        <div className="race-detail-viewer-shell">
          <RaceViewer2D
            connectionState={viewer.connectionState}
            contenders={contenders}
            eyebrow={eyebrow}
            race={effectiveRace}
            raceResult={viewer.raceResult}
            raceScript={viewer.raceScript}
            rankingEyebrow="Live order"
            rankingStateLabel={effectiveRace.raceStatus === RACE_STATUSES.SCHEDULED ? "Confirmed" : undefined}
            rankingTitle={rankingTitle}
            statusLabel={statusLabel}
          />
        </div>
      )}
    </section>
  );
}
