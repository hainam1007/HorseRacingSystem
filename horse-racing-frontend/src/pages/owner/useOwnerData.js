import { useCallback, useEffect, useState } from "react";
import { ownerApi } from "../../api/ownerApi";
import { useAuth } from "../../auth/AuthContext";
import { toHorseApprovalStatus, toOwnerHorse, toOwnerJockey, toOwnerPrizeAward, toOwnerProfile, toOwnerRegistration, toOwnerTournament } from "./ownerAdapters";

export function useOwnerHorses() {
  const [horses, setHorses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHorses = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await ownerApi.getHorses();
      setHorses((data.horses || []).map(toOwnerHorse));
    } catch (apiError) {
      setError(apiError.message || "Unable to load horses.");
      setHorses([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHorses();
  }, [loadHorses]);

  return { horses, isLoading, error, reload: loadHorses };
}

export function useOwnerHorse(horseId) {
  const [horse, setHorse] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(horseId));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHorse() {
      if (!horseId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const data = await ownerApi.getHorse(horseId);
        if (!cancelled) {
          setHorse(toOwnerHorse(data.horse));
        }
      } catch (apiError) {
        if (!cancelled) {
          setError(apiError.message || "Unable to load horse.");
          setHorse(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadHorse();

    return () => {
      cancelled = true;
    };
  }, [horseId]);

  return { horse, isLoading, error };
}

export function useOwnerProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await ownerApi.getProfile();
      setProfile(toOwnerProfile(data.profile, user));
    } catch (apiError) {
      setError(apiError.message || "Unable to load owner profile.");
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return { profile, isLoading, error, reload: loadProfile };
}

export function useOwnerHorseApprovalStatus(horseId) {
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(horseId));
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadApprovalStatus() {
      if (!horseId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const data = await ownerApi.getHorseApprovalStatus(horseId);
        if (!cancelled) {
          setApprovalStatus(toHorseApprovalStatus(data));
        }
      } catch (apiError) {
        if (!cancelled) {
          setError(apiError.message || "Unable to load approval status.");
          setApprovalStatus(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadApprovalStatus();

    return () => {
      cancelled = true;
    };
  }, [horseId]);

  return { approvalStatus, isLoading, error };
}

export function useOwnerJockeys() {
  const [jockeys, setJockeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadJockeys = useCallback(async (raceId = "") => {
    setIsLoading(true);
    setError("");

    try {
      const data = await ownerApi.getJockeys(raceId);
      setJockeys((data.jockeys || []).map(toOwnerJockey));
    } catch (apiError) {
      setError(apiError.message || "Unable to load available jockeys.");
      setJockeys([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJockeys();
  }, [loadJockeys]);

  return { jockeys, isLoading, error, reload: loadJockeys };
}

export function useOwnerTournaments() {
  const [tournaments, setTournaments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTournaments = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await ownerApi.getTournaments();
      setTournaments((data.tournaments || []).map(toOwnerTournament));
    } catch (apiError) {
      setError(apiError.message || "Unable to load tournaments.");
      setTournaments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  return { tournaments, isLoading, error, reload: loadTournaments };
}

export function useOwnerRegistrations() {
  const [registrations, setRegistrations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRegistrations = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const [registrationResponse, horsesResponse, tournamentsResponse] = await Promise.all([
        ownerApi.getRegistrations().catch(() => ({ registrations: [] })),
        ownerApi.getHorses().catch(() => ({ horses: [] })),
        ownerApi.getTournaments().catch(() => ({ tournaments: [] })),
      ]);

      const horsesById = new Map(
        (horsesResponse.horses || []).map((horse) => [String(horse._id || horse.id), horse])
      );
      const tournamentsById = new Map(
        (tournamentsResponse.tournaments || []).map((tournament) => [String(tournament._id || tournament.id), tournament])
      );

      // Note: We intentionally skip `getTournamentRaces()` here because that
      // endpoint currently returns 400 for some tournaments (sequelized UUID
      // PK mismatch). The `/api/registrations` payload already populates each
      // registration's `race` / `tournament` / `horse` includes, so we build
      // `racesById` from those embedded objects instead.
      const racesById = new Map();

      setRegistrations(
        (registrationResponse.registrations || []).map((registration, index) =>
          toOwnerRegistration(registration, index, { horsesById, racesById, tournamentsById })
        )
      );
    } catch (apiError) {
      setError(apiError.message || "Unable to load registrations.");
      setRegistrations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  return { registrations, isLoading, error, reload: loadRegistrations };
}

export function useOwnerCancellationTickets() {
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await ownerApi.getCancellationTickets();
      setTickets(data.cancellation_tickets || []);
    } catch (apiError) {
      setError(apiError.message || "Unable to load cancellation requests.");
      setTickets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  return { tickets, isLoading, error, reload: loadTickets };
}

export function useOwnerJockeyAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAssignments = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await ownerApi.getJockeyAssignments();
      setAssignments(data.assignments || []);
    } catch (apiError) {
      setError(apiError.message || "Unable to load jockey assignments.");
      setAssignments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  return { assignments, isLoading, error, reload: loadAssignments };
}

export function useOwnerPrizeAwards() {
  const [awards, setAwards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAwards = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await ownerApi.getPrizeAwards();
      setAwards((data.awards || []).map(toOwnerPrizeAward));
    } catch (apiError) {
      setError(apiError.message || "Unable to load owner results and prizes.");
      setAwards([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAwards();
  }, [loadAwards]);

  return { awards, isLoading, error, reload: loadAwards };
}
