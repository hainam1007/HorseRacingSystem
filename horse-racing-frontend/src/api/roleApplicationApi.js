import { apiRequest } from "./client";

export const ROLE_APPLICATION_ENDPOINTS = {
  horse_owner: "/role-applications/horse-owner",
  jockey: "/role-applications/jockey",
  race_referee: "/role-applications/race-referee",
};

export const roleApplicationApi = {
  listMine(params = {}) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        query.set(key, value);
      }
    });

    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiRequest(`/role-applications/me${suffix}`);
  },

  apply(role, payload) {
    const endpoint = ROLE_APPLICATION_ENDPOINTS[role];

    if (!endpoint) {
      throw new Error("Unsupported role application type.");
    }

    return apiRequest(endpoint, {
      method: "POST",
      body: payload,
    });
  },
};
