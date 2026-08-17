import { useMemo } from "react";
import { CONNECTION_STATES } from "../../../realtime/socketEvents";
import { RACE_STATUS } from "../race/raceStatus";
import { createMockRaceScript, createRaceEngineOrderScript } from "./mockRaceFixtures";

export function useRaceViewerSession(race, contenders, options = {}) {
  return useMemo(() => {
    const createScript = options.useRaceEngineOrder ? createRaceEngineOrderScript : createMockRaceScript;
    const engineScript = options.raceScript || null;

    if (!race) {
      return {
        connectionState: CONNECTION_STATES.CONNECTED,
        raceResult: null,
        raceScript: null,
      };
    }

    if (race.raceStatus === RACE_STATUS.RUNNING) {
      const startsAt = race.engineGeneratedAt
        ? new Date(race.engineGeneratedAt).getTime()
        : (race.updatedAt ? new Date(race.updatedAt).getTime() : Date.now()) + 3000;
      return {
        connectionState: CONNECTION_STATES.CONNECTED,
        raceResult: null,
        raceScript: engineScript || createScript(race.id, startsAt, contenders),
      };
    }

    if (race.raceStatus === RACE_STATUS.SCHEDULED) {
      const startsAt = Date.now() + 3600000; // 1 hour in the future
      return {
        connectionState: CONNECTION_STATES.CONNECTED,
        raceResult: null,
        raceScript: createScript(race.id, startsAt, contenders),
      };
    }

    if (race.raceStatus === RACE_STATUS.COMPLETED) {
      const startsAt = race.engineGeneratedAt
        ? new Date(race.engineGeneratedAt).getTime()
        : race.updatedAt
          ? new Date(race.updatedAt).getTime() - 68000
          : Date.now() - 90000;
      return {
        connectionState: CONNECTION_STATES.CONNECTED,
        raceResult: null,
        raceScript: engineScript || createScript(race.id, startsAt, contenders),
      };
    }

    return {
      connectionState: CONNECTION_STATES.CONNECTED,
      raceResult: null,
      raceScript: null,
    };
  }, [race, contenders, options.raceScript, options.useRaceEngineOrder]);
}
