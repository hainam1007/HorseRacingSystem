import { apiRequest } from "./client";

export const authApi = {
  getRoles() {
    return apiRequest("/auth/roles");
  },

  login(credentials) {
    return apiRequest("/auth/login", {
      method: "POST",
      body: credentials,
    });
  },

  register(payload) {
    return apiRequest("/auth/register", {
      method: "POST",
      body: payload,
    });
  },

  verifyAccount(otp) {
    return apiRequest("/auth/verify-account", {
      method: "POST",
      body: { otp },
    });
  },

  resendVerification(email) {
    return apiRequest("/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
  },

  forgotPassword(email) {
    return apiRequest("/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
  },

  resetPassword(payload) {
    return apiRequest("/auth/reset-password", {
      method: "POST",
      body: payload,
    });
  },

  changePassword(payload) {
    return apiRequest("/auth/change-password", {
      method: "POST",
      body: payload,
    });
  },

  me() {
    return apiRequest("/auth/me");
  },

  logout() {
    return apiRequest("/auth/logout", {
      method: "POST",
    });
  },
};
