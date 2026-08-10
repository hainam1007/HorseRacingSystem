import { apiRequest } from "./client";

function withQuery(path, params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, value);
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return `${path}${suffix}`;
}

export const refereeApi = {
  getWorkspace() {
    return apiRequest("/referees/me/workspace");
  },

  getAssignedRaces(params = {}) {
    return apiRequest(withQuery("/races", params));
  },

  getRace(id) {
    return apiRequest(`/races/${id}`);
  },

  getRaceParticipants(id) {
    return apiRequest(`/race-results/races/${id}/participants`);
  },


  startRace(id) {
    return apiRequest(`/races/${id}/start`, { method: "POST" });
  },

  completeRace(id) {
    return apiRequest(`/races/${id}/complete`, { method: "POST" });
  },

  listRaceResults(params = {}) {
    return apiRequest(withQuery("/race-results", params));
  },

  createRaceResult(payload) {
    return apiRequest("/race-results", {
      method: "POST",
      body: payload,
    });
  },

  updateRaceResult(id, payload) {
    return apiRequest(`/race-results/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  getRaceResultParticipants(raceId) {
    return apiRequest(`/race-results/races/${raceId}/participants`);
  },

  getRaceResultReadiness(raceId) {
    return apiRequest(`/race-results/races/${raceId}/readiness`);
  },

  finalizeRaceResults(raceId) {
    return apiRequest(`/race-results/races/${raceId}/finalize`, { method: "POST" });
  },

  applyRaceResultPenalties(raceId) {
    return apiRequest(`/race-results/races/${raceId}/apply-penalties`, { method: "POST" });
  },

  listViolations(params = {}) {
    return apiRequest(withQuery("/violations", params));
  },

  createViolation(payload) {
    return apiRequest("/violations", {
      method: "POST",
      body: payload,
    });
  },

  updateViolation(id, payload) {
    return apiRequest(`/violations/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  getViolationOptions() {
    return apiRequest("/violations/options");
  },

  previewViolationPenalty(payload) {
    return apiRequest("/violations/penalty-preview", { method: "POST", body: payload });
  },

  getViolation(id) {
    return apiRequest(`/violations/${id}`);
  },

  confirmViolation(id, payload) {
    const body = typeof payload === "string" ? { decision: payload } : payload;
    return apiRequest(`/violations/${id}/confirm`, { method: "POST", body });
  },

  dismissViolation(id, decision) {
    return apiRequest(`/violations/${id}/dismiss`, { method: "POST", body: { decision } });
  },

  listHorseChecks(params = {}) {
    return apiRequest(withQuery("/horse-checks", params));
  },

  createHorseCheck(phase, payload) {
    const phasePath = {
      pre_race: "pre-race",
      during_race: "during-race",
      post_race: "post-race",
    }[phase];

    return apiRequest(`/horse-checks/${phasePath || ""}`.replace(/\/$/, ""), {
      method: "POST",
      body: payload,
    });
  },

  updateHorseCheck(id, payload) {
    return apiRequest(`/horse-checks/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  bulkSaveHorseChecks(phase, payload) {
    const phasePath = {
      pre_race: "pre-race",
      post_race: "post-race",
    }[phase];

    return apiRequest(`/horse-checks/${phasePath}/bulk`, {
      method: "POST",
      body: payload,
    });
  },

  listRefereeReports(params = {}) {
    return apiRequest(withQuery("/referee-reports", params));
  },

  createRefereeReport(payload) {
    return apiRequest("/referee-reports", {
      method: "POST",
      body: payload,
    });
  },

  updateRefereeReport(id, payload) {
    return apiRequest(`/referee-reports/${id}`, {
      method: "PATCH",
      body: payload,
    });
  },

  submitRefereeReport(id) {
    return apiRequest(`/referee-reports/${id}/submit`, {
      method: "POST",
    });
  },
};
