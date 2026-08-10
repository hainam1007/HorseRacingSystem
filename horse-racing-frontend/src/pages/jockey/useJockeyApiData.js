import { useCallback, useEffect, useState } from "react";
import { jockeyApi } from "../../api/jockeyApi";
import { useAuth } from "../../auth/AuthContext";
import { adaptJockeyApiData } from "./jockeyAdapters";

// Assignment changes are made by the owner from a separate session, so the
// jockey workspace needs a lightweight background revalidation channel.
const ASSIGNMENT_REFRESH_INTERVAL_MS = 5000;

export function useJockeyApiData() {
  const { user } = useAuth();
  const [state, setState] = useState(() => adaptJockeyApiData({ user }));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadJockeyData = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const [me, approvalStatus, assignments, schedule, results, prizeAwards, stats, violations] = await Promise.all([
        jockeyApi.getMe(),
        jockeyApi.getApprovalStatus(),
        jockeyApi.getAssignments(),
        jockeyApi.getSchedule(),
        jockeyApi.getResults(),
        jockeyApi.getPrizeAwards(),
        jockeyApi.getStats(),
        jockeyApi.getViolations(),
      ]);

      setState(adaptJockeyApiData({
        me,
        approvalStatus,
        assignments,
        schedule,
        results,
        prizeAwards,
        stats,
        violations,
        user,
      }));
    } catch (apiError) {
      setError(apiError.message || "Unable to load live jockey data.");
      setState(adaptJockeyApiData({ user }));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadJockeyData();
  }, [loadJockeyData]);

  const refreshAssignments = useCallback(async () => {
    const assignments = await jockeyApi.getAssignments();
    const refreshedAssignments = adaptJockeyApiData({ assignments, user });

    setState((current) => ({
      ...current,
      assignments: refreshedAssignments.assignments,
      invitations: refreshedAssignments.invitations,
    }));
  }, [user]);

  useEffect(() => {
    // The first full load supplies the surrounding profile/dashboard data.
    // Subsequent refreshes only request assignments, keeping the contract UI
    // current without repeatedly reloading the whole jockey workspace.
    if (isLoading) return undefined;

    let stopped = false;
    let isRequestInFlight = false;
    let refreshTimer = null;

    const refreshIfVisible = async () => {
      if (stopped || document.visibilityState !== "visible" || isRequestInFlight) return;

      isRequestInFlight = true;
      try {
        await refreshAssignments();
      } catch {
        // Keep the most recently rendered invitation data visible. A later
        // refresh will retry automatically, so transient network failures do
        // not interrupt a jockey reviewing a contract.
      } finally {
        isRequestInFlight = false;
      }
    };

    const startBackgroundRefresh = () => {
      if (refreshTimer || document.visibilityState !== "visible") return;
      refreshTimer = window.setInterval(refreshIfVisible, ASSIGNMENT_REFRESH_INTERVAL_MS);
    };

    const stopBackgroundRefresh = () => {
      if (!refreshTimer) return;
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshIfVisible();
        startBackgroundRefresh();
      } else {
        stopBackgroundRefresh();
      }
    };

    startBackgroundRefresh();
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      stopBackgroundRefresh();
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoading, refreshAssignments]);

  const respondToMeeting = useCallback(async (id, accepted) => {
    const action = accepted ? jockeyApi.acceptAppointment : jockeyApi.rejectAppointment;
    await action(id, accepted ? "Appointment accepted" : "Appointment rejected");
    await loadJockeyData();
  }, [loadJockeyData]);

  const respondToTerms = useCallback(async (id, accepted) => {
    const action = accepted ? jockeyApi.confirmTerms : jockeyApi.rejectTerms;
    await action(id, accepted ? "Terms confirmed" : "Terms need changes");
    await loadJockeyData();
  }, [loadJockeyData]);

  const respondToContract = useCallback(async (id, accepted) => {
    const action = accepted ? jockeyApi.confirmContract : jockeyApi.rejectContract;
    await action(id, accepted ? "Contract confirmed" : "Contract rejected");
    await loadJockeyData();
  }, [loadJockeyData]);

  const withdrawAssignment = useCallback(async (id, reason) => {
    await jockeyApi.withdrawAssignment(id, reason);
    await loadJockeyData();
  }, [loadJockeyData]);

  const requestCancellation = useCallback(async (id, reason) => {
    await jockeyApi.requestAssignmentCancellation(id, reason);
    await loadJockeyData();
  }, [loadJockeyData]);

  const respondToCancellation = useCallback(async (id, decision, responseMessage = "") => {
    await jockeyApi.respondToAssignmentCancellation(id, decision, responseMessage);
    await loadJockeyData();
  }, [loadJockeyData]);

  const updateProfile = useCallback(async (payload) => {
    await jockeyApi.updateMe(payload);
    await loadJockeyData();
  }, [loadJockeyData]);

  return {
    ...state,
    isLoading,
    error,
    reload: loadJockeyData,
    respondToMeeting,
    respondToTerms,
    respondToContract,
    withdrawAssignment,
    requestCancellation,
    respondToCancellation,
    updateProfile,
  };
}
