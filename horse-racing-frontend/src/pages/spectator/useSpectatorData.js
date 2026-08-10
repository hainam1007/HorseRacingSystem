import { useCallback, useEffect, useState } from "react";
import { spectatorApi } from "../../api/spectatorApi";
import { adaptRaceResults, adaptTournamentDetail, adaptTournamentList, summarizeTournamentRaces, toHorseLeaderboard } from "./spectatorAdapters";

const TOURNAMENT_DETAIL_REFRESH_MS = 10000;
const RACE_RESULT_REFRESH_MS = 3000;

function isAuthError(apiError) {
  return apiError?.status === 401 || apiError?.status === 403;
}

export function useSpectatorTournaments() {
  const [tournaments, setTournaments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTournaments = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await spectatorApi.listTournaments();
      const adapted = adaptTournamentList(data);
      const enrichedResults = await Promise.allSettled(
        adapted.tournaments.map(async (tournament) => {
          const racesPayload = await spectatorApi.listRaces({ tournament_id: tournament.id });
          return {
            ...tournament,
            ...summarizeTournamentRaces(racesPayload),
          };
        })
      );
      const enrichedTournaments = adapted.tournaments.map((tournament, index) =>
        enrichedResults[index]?.status === "fulfilled"
          ? enrichedResults[index].value
          : tournament
      );
      setTournaments(enrichedTournaments);
    } catch (apiError) {
      setError(apiError.message || (isAuthError(apiError) ? "Your session expired. Please sign in again." : "Unable to load tournaments."));
      setTournaments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  return {
    tournaments,
    isLoading,
    error,
    reload: loadTournaments,
  };
}

export function useSpectatorTournamentDetail(tournamentId) {
  const [state, setState] = useState({
    tournament: null,
    races: [],
  });
  const [isLoading, setIsLoading] = useState(Boolean(tournamentId));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTournamentDetail(isBackground = false) {
      if (!tournamentId) {
        if (!isBackground) setIsLoading(false);
        return;
      }

      if (!isBackground) setIsLoading(true);
      setError("");

      try {
        const [tournamentResult, racesResult] = await Promise.allSettled([
          spectatorApi.getTournament(tournamentId),
          spectatorApi.listRaces({ tournament_id: tournamentId }),
        ]);

        if (tournamentResult.status === "rejected") throw tournamentResult.reason;

        const adapted = adaptTournamentDetail({
          tournamentPayload: tournamentResult.value,
          racesPayload: racesResult.status === "fulfilled" ? racesResult.value : { races: [] },
        });

        if (!cancelled) {
          setState(adapted);
          if (racesResult.status === "rejected") {
            setError(racesResult.reason?.message || "Unable to load the live race schedule.");
          }
        }
      } catch (apiError) {
        if (isAuthError(apiError)) {
          if (!cancelled) {
            setError(apiError.message || "Your session expired. Please sign in again.");
            setState({
              tournament: null,
              races: [],
            });
          }
          return;
        }

        if (!cancelled) {
          setError(apiError.message || "Unable to load tournament detail.");
          setState({
            tournament: null,
            races: [],
          });
        }
      } finally {
        if (!cancelled && !isBackground) {
          setIsLoading(false);
        }
      }
    }

    loadTournamentDetail(false);

    const interval = setInterval(() => {
      loadTournamentDetail(true);
    }, TOURNAMENT_DETAIL_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tournamentId]);

  return {
    ...state,
    isLoading,
    error,
  };
}

export function useSpectatorRaceResults() {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadResults = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await spectatorApi.listRaceResults({ status: "published" });
      const adapted = adaptRaceResults(data);
      setResults(adapted.results);
    } catch (apiError) {
      setError(apiError.message || "Unable to load live race results.");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  return {
    results,
    horseLeaderboard: toHorseLeaderboard(results),
    isLoading,
    error,
    reload: loadResults,
  };
}

export function useSpectatorRaceResultsSingle(raceId) {
  const [results, setResults] = useState([]);
  const [raceInfo, setRaceInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadResults = useCallback(async (isBackground = false) => {
    if (!raceId) {
      if (!isBackground) setIsLoading(false);
      return;
    }
    if (!isBackground) setIsLoading(true);
    setError("");

    try {
      const data = await spectatorApi.getRaceResults(raceId);
      const adapted = adaptRaceResults(data);
      const sorted = (adapted.results || []).sort((a, b) => {
        const firstPosition = Number.isInteger(a.position) ? a.position : Number.MAX_SAFE_INTEGER;
        const secondPosition = Number.isInteger(b.position) ? b.position : Number.MAX_SAFE_INTEGER;
        return firstPosition - secondPosition;
      });
      setResults(sorted);
      setRaceInfo(null);
    } catch (apiError) {
      setError(apiError.message || "Unable to load race results.");
      setResults([]);
      setRaceInfo(null);
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [raceId]);

  useEffect(() => {
    loadResults(false);

    const interval = setInterval(() => {
      loadResults(true);
    }, RACE_RESULT_REFRESH_MS);

    return () => {
      clearInterval(interval);
    };
  }, [loadResults]);

  return {
    results,
    raceInfo,
    isLoading,
    error,
    reload: loadResults,
  };
}
