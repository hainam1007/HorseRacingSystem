import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { refereeApi } from "../api/refereeApi";
import { adaptRefereeApiData } from "./refereeAdapters";

export function useRefereeData() {
  const { profiles } = useAuth();
  const refereeId = profiles?.race_referee?._id || profiles?.race_referee?.id || "";
  const [races, setRaces] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUnavailable, setIsUnavailable] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setIsUnavailable(false);

    try {
      const workspace = await refereeApi.getWorkspace();

      setIsUnavailable(false);
      setRaces(adaptRefereeApiData(workspace));
    } catch (apiError) {
      setRaces([]);
      setError(apiError.message || "Unable to load referee workspace data.");
    } finally {
      setIsLoading(false);
    }
  }, [refereeId]);

  useEffect(() => { reload(); }, [reload]);

  const raceMap = useMemo(() => new Map(races.map((race) => [race.id, race])), [races]);

  return {
    races,
    data: races,
    isLoading,
    error,
    isEmpty: !isLoading && !error && races.length === 0,
    isUnavailable,
    reload,
    getRace: useCallback((raceId) => raceMap.get(raceId) || null, [raceMap]),
  };
}
