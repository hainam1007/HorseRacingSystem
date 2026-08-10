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

export const prizeApi = {
  listAwards(params = {}) {
    return apiRequest(withQuery("/prizes", params));
  },

  getRaceConfig(raceId) {
    return apiRequest(`/prizes/races/${raceId}/config`);
  },

  listRaceAwards(raceId) {
    return apiRequest(`/prizes/races/${raceId}/awards`);
  },

  configureRace(raceId, payload) {
    return apiRequest(`/prizes/races/${raceId}/config`, {
      method: "POST",
      body: payload,
    });
  },

  calculateRaceAwards(raceId) {
    return apiRequest(`/prizes/races/${raceId}/calculate`, { method: "POST" });
  },

  approveRaceAwards(raceId) {
    return apiRequest(`/prizes/races/${raceId}/approve`, { method: "POST" });
  },

  markAwardPaid(awardId) {
    return apiRequest(`/prizes/awards/${awardId}/mark-paid`, { method: "POST" });
  },
};
