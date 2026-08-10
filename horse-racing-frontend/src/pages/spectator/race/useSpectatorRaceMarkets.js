import { useCallback, useEffect, useState } from "react";
import { spectatorApi } from "../../../api/spectatorApi.js";
import { toSpectatorRace } from "../spectatorAdapters.js";
import { tournamentRaces, tournaments } from "../tournamentData.js";

const primaryTournament = tournaments[0];

function createPreviewMarkets() {
  return tournamentRaces.map((race) => ({
    ...race,
    tournamentId: primaryTournament.id,
    tournamentName: primaryTournament.name,
    tournamentLocation: primaryTournament.location,
    isPreview: true,
  }));
}

function extractRaces(payload) {
  if (Array.isArray(payload?.races)) return payload.races;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function useSpectatorRaceMarkets() {
  const [state, setState] = useState({ races: [], isLoading: true, error: "", isPreview: false });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: "" }));
    try {
      const payload = await spectatorApi.listRaces();
      const rows = extractRaces(payload);
      const races = rows.map((row, index) => {
        const adapted = toSpectatorRace(row, index);
        const tournament = tournaments.find((item) => String(item.id) === String(adapted.tournamentId));
        return {
          ...adapted,
          tournamentName: adapted.tournamentName || tournament?.name || "Tournament",
          tournamentLocation: adapted.tournamentLocation || tournament?.location || adapted.location,
          isPreview: false,
        };
      });
      setState({ races, isLoading: false, error: "", isPreview: false });
    } catch (error) {
      if (import.meta.env.DEV) {
        setState({
          races: createPreviewMarkets(),
          isLoading: false,
          error: "Race market API is not available. Showing development preview markets.",
          isPreview: true,
        });
      } else {
        setState({ races: [], isLoading: false, error: error.message || "Unable to load race markets.", isPreview: false });
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
