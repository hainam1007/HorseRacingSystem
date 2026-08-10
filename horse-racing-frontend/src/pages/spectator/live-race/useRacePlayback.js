import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONNECTION_STATES } from "../../../realtime/socketEvents";
import { adaptRaceScript } from "./raceScriptAdapter";
import { buildLiveRanking, interpolateDistance } from "./raceMath";

const RACE_PLAYBACK_RATE = 1.7;

export function useRacePlayback({ connectionState, raceId, raceResult, raceScript }) {
  const runnerRefs = useRef(new Map());
  const trackRef = useRef(null);
  const frameRef = useRef(0);
  const lastRankingUpdateRef = useRef(0);
  const [ranking, setRanking] = useState([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playbackState, setPlaybackState] = useState("waiting");

  const adaptedScript = useMemo(() => {
    if (!raceScript) return { error: "", script: null };
    try {
      return { error: "", script: adaptRaceScript(raceScript, raceId) };
    } catch (error) {
      return { error: error.message || "Race script is invalid.", script: null };
    }
  }, [raceId, raceScript]);
  const script = adaptedScript.script;
  const scriptError = adaptedScript.error;

  const registerRunner = useCallback((horseId, marker) => {
    if (marker !== undefined) {
      if (marker) runnerRefs.current.set(horseId, marker);
      else runnerRefs.current.delete(horseId);
    }
  }, []);

  const registerTrack = useCallback((track) => {
    trackRef.current = track;
  }, []);

  useEffect(() => {
    window.cancelAnimationFrame(frameRef.current);
    if (!script) {
      setRanking([]);
      setElapsedMs(0);
      setPlaybackState(scriptError ? "error" : "waiting");
      return undefined;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastReducedUpdate = 0;

    const renderFrame = (timestamp) => {
      const isDisconnected = [CONNECTION_STATES.DISCONNECTED, CONNECTION_STATES.ERROR, CONNECTION_STATES.RECONNECTING].includes(connectionState);
      if (!isDisconnected) {
        const wallElapsed = Date.now() - script.startsAt;
        const rawElapsed = wallElapsed < 0 ? wallElapsed : wallElapsed * RACE_PLAYBACK_RATE;
        const elapsed = raceResult ? script.durationMs : Math.max(0, Math.min(script.durationMs, rawElapsed));
        const shouldRender = !reducedMotion || timestamp - lastReducedUpdate >= 500 || Boolean(raceResult);

        if (shouldRender) {
          lastReducedUpdate = timestamp;
          const distances = {};
          const provisionalFinishOrder = [...script.horses]
            .sort((left, right) => left.finishTimeMs - right.finishTimeMs)
            .map((horse) => horse.horseId);
          const officialPositions = new Map((raceResult?.results || []).map((result) => [result.horse_id, result.position]));
          const track = trackRef.current;
          const compactTrack = track?.clientWidth <= 760;
          const trackStyles = track ? window.getComputedStyle(track) : null;
          const baseInsetX = Number.parseFloat(trackStyles?.getPropertyValue("--track-inset-x")) || (compactTrack ? 28 : 84);
          const baseInsetY = Number.parseFloat(trackStyles?.getPropertyValue("--track-inset-y")) || (compactTrack ? 36 : 54);
          const laneStepX = Number.parseFloat(trackStyles?.getPropertyValue("--lane-step-x")) || (compactTrack ? 11 : 15);
          const laneStepY = Number.parseFloat(trackStyles?.getPropertyValue("--lane-step-y")) || (compactTrack ? 9 : 12);
          script.horses.forEach((horse) => {
            const distance = raceResult ? script.trackLength : interpolateDistance(horse.checkpoints, elapsed);
            distances[horse.horseId] = distance;
            const marker = runnerRefs.current.get(horse.horseId);
            if (marker && track) {
              marker.style.left = "0px";
              marker.style.top = "0px";
              const finishTimeMs = horse.finishTimeMs || script.durationMs;
              const finishPosition = officialPositions.get(horse.horseId) || provisionalFinishOrder.indexOf(horse.horseId) + 1;
              const targetFinishOffset = 0.008 + (script.horses.length - finishPosition) * 0.024;
              const finishOverrun = elapsed > finishTimeMs
                ? Math.min(targetFinishOffset, ((elapsed - finishTimeMs) / 1100) * targetFinishOffset)
                : 0;
              const progress = (distance / script.trackLength) + finishOverrun;
              const laneIndex = Math.max(0, horse.lane - 1);
              const insetX = baseInsetX + laneIndex * laneStepX;
              const insetY = baseInsetY + laneIndex * laneStepY;
              const radiusX = Math.max(20, track.clientWidth / 2 - insetX);
              const radiusY = Math.max(18, track.clientHeight / 2 - insetY);
              const angle = Math.PI + progress * Math.PI * 2;
              const x = track.clientWidth / 2 + radiusX * Math.cos(angle) - marker.offsetWidth / 2;
              const y = track.clientHeight / 2 + radiusY * Math.sin(angle) - marker.offsetHeight / 2;
              const tangentDegrees = (angle * 180 / Math.PI) + 90;
              marker.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${tangentDegrees}deg)`;
              marker.dataset.progress = String(Math.round((distance / script.trackLength) * 100));
              marker.classList.toggle("is-leading", false);
              marker.classList.toggle("is-finished", distance >= script.trackLength);
            }
          });

          if (timestamp - lastRankingUpdateRef.current >= 140 || raceResult) {
            lastRankingUpdateRef.current = timestamp;
            let nextRanking = buildLiveRanking(script.horses, distances, script.trackLength);
            if (raceResult?.results?.length) {
              const resultOrder = new Map(raceResult.results.map((result) => [result.horse_id, result]));
              nextRanking = nextRanking
                .map((horse) => ({ ...horse, finishTimeMs: resultOrder.get(horse.horseId)?.finish_time_ms, position: resultOrder.get(horse.horseId)?.position || horse.position }))
                .sort((left, right) => left.position - right.position);
            }
            const leadingMarker = runnerRefs.current.get(nextRanking[0]?.horseId);
            leadingMarker?.classList.add("is-leading");
            setRanking(nextRanking);
            setElapsedMs(elapsed);
          }

          if (raceResult) setPlaybackState("finished");
          else if (rawElapsed < 0) setPlaybackState("ready");
          else if (elapsed < script.durationMs) setPlaybackState("racing");
          else setPlaybackState("awaiting-result");
        }
      } else {
        setPlaybackState("reconnecting");
      }
      frameRef.current = window.requestAnimationFrame(renderFrame);
    };

    frameRef.current = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [connectionState, raceResult, script, scriptError]);

  const racePhase = !script
    ? "pre-race"
    : elapsedMs >= script.durationMs
      ? "finish"
      : elapsedMs / script.durationMs >= 0.75
        ? "final stretch"
        : elapsedMs / script.durationMs >= 0.45
          ? "back straight"
          : elapsedMs > 0
            ? "opening pace"
            : "at the gate";

  return { elapsedMs, playbackState, racePhase, ranking, registerRunner, registerTrack, script, scriptError };
}
