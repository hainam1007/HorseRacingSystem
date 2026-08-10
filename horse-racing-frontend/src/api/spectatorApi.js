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

export const spectatorApi = {
  listTournaments(params = {}) {
    return apiRequest(withQuery("/tournaments", params));
  },

  getTournament(id) {
    return apiRequest(`/tournaments/${id}`);
  },

  listRaces(params = {}) {
    return apiRequest(withQuery("/races", params));
  },

  getRaceOdds(raceId) {
    return apiRequest(`/races/${raceId}/odds`);
  },

  listRaceResults(params = {}) {
    return apiRequest(withQuery("/race-results", params));
  },

  getRaceResults(raceId) {
    return apiRequest(`/users/spectator/races/${raceId}/results`);
  },

  getRaceLiveState(raceId) {
    return apiRequest(`/users/spectator/races/${raceId}/live-state`);
  },
};
