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

export const depositApi = {
  listPackages() {
    return apiRequest("/deposit/packages");
  },

  previewCustom(tokenAmount) {
    return apiRequest("/deposit/preview-custom", {
      method: "POST",
      body: { token_amount: tokenAmount },
    });
  },

  createPaymentIntent(payload) {
    return apiRequest("/deposit/intent", {
      method: "POST",
      body: payload,
    });
  },

  getHistory(params = {}) {
    return apiRequest(withQuery("/deposit/history", params));
  },

  confirmPaymentReturn(params = {}) {
    return apiRequest(withQuery("/deposit/webhook/payment", { ...params, format: "json" }));
  },
};

export const adminDepositApi = {
  listPackages() {
    return apiRequest("/admin/deposit-packages");
  },

  createPackage(payload) {
    return apiRequest("/admin/deposit-packages", {
      method: "POST",
      body: payload,
    });
  },

  updatePackage(id, payload) {
    return apiRequest(`/admin/deposit-packages/${id}`, {
      method: "PUT",
      body: payload,
    });
  },

  deletePackage(id) {
    return apiRequest(`/admin/deposit-packages/${id}`, {
      method: "DELETE",
    });
  },

  listRequests(params = {}) {
    return apiRequest(withQuery("/admin/deposit-requests", params));
  },
};
