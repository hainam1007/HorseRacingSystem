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

export const rewardApi = {
  listRewards() {
    return apiRequest("/rewards");
  },

  redeemReward(itemId) {
    return apiRequest(`/rewards/${itemId}/redeem`, {
      method: "POST",
    });
  },

  getMyRedemptions(params = {}) {
    return apiRequest(withQuery("/rewards/redemptions", params));
  },
};
