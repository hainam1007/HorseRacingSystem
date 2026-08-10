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

export const betApi = {
  placeBet({ race_id, horse_id, predicted_horse_id, stake_amount }) {
    return apiRequest("/bets", {
      method: "POST",
      body: {
        race_id,
        horse_id: horse_id || predicted_horse_id,
        stake_amount,
      },
    });
  },

  getMyBets(params = {}) {
    return apiRequest(withQuery("/bets/me", params));
  },

  settleRaceBets(raceId) {
    return apiRequest(`/bets/races/${raceId}/settle`, { method: "POST" });
  },
};
