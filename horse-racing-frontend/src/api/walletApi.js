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

export const walletApi = {
  getMyWallet() {
    return apiRequest("/wallet/me");
  },

  depositTokens({ vnd_amount, reference_id }) {
    return apiRequest("/wallet/deposit", {
      method: "POST",
      body: {
        vnd_amount,
        reference_id,
      },
    });
  },

  getTransactions(params = {}) {
    return apiRequest(withQuery("/wallet/transactions", params));
  },
};
