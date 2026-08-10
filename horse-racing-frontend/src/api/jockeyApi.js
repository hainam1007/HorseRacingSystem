import { apiRequest } from "./client";

function withQuery(path, params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return `${path}${suffix}`;
}

export const jockeyApi = {
  getMe() {
    return apiRequest("/jockeys/me");
  },

  updateMe(payload) {
    return apiRequest("/jockeys/me", {
      method: "PATCH",
      body: payload,
    });
  },

  getApprovalStatus() {
    return apiRequest("/jockeys/me/approval-status");
  },

  getAssignments(params = {}) {
    return apiRequest(withQuery("/jockeys/me/assignments", params));
  },

  acceptAssignment(id, responseMessage = "Accepted") {
    return apiRequest(`/jockeys/me/assignments/${id}/accept`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  rejectAssignment(id, responseMessage = "Rejected") {
    return apiRequest(`/jockeys/me/assignments/${id}/reject`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  acceptAppointment(id, responseMessage = "Appointment accepted") {
    return apiRequest(`/jockey-assignments/${id}/accept-appointment`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  rejectAppointment(id, responseMessage = "Appointment rejected") {
    return apiRequest(`/jockey-assignments/${id}/reject-appointment`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  acceptMeeting(id, responseMessage = "Appointment accepted") {
    return apiRequest(`/jockey-assignments/${id}/accept-appointment`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  rejectMeeting(id, responseMessage = "Appointment rejected") {
    return apiRequest(`/jockey-assignments/${id}/reject-appointment`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  confirmTerms(id, responseMessage = "Terms confirmed") {
    return apiRequest(`/jockey-assignments/${id}/confirm-terms`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  rejectTerms(id, responseMessage = "Terms need changes") {
    return apiRequest(`/jockey-assignments/${id}/reject-terms`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  confirmContract(id, responseMessage = "Contract confirmed") {
    return apiRequest(`/jockey-assignments/${id}/confirm-contract`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  rejectContract(id, responseMessage = "Contract rejected") {
    return apiRequest(`/jockey-assignments/${id}/reject-contract`, {
      method: "POST",
      body: { response_message: responseMessage },
    });
  },

  withdrawAssignment(id, reason) {
    return apiRequest(`/jockey-assignments/${id}/withdraw`, {
      method: "POST",
      body: { reason },
    });
  },

  requestAssignmentCancellation(id, reason) {
    return apiRequest(`/jockey-assignments/${id}/cancellation-request`, {
      method: "POST",
      body: { reason },
    });
  },

  respondToAssignmentCancellation(id, decision, responseMessage = "") {
    return apiRequest(`/jockey-assignments/${id}/cancellation-request/respond`, {
      method: "POST",
      body: { decision, response_message: responseMessage },
    });
  },

  getSchedule(params = {}) {
    return apiRequest(withQuery("/jockeys/me/schedule", params));
  },

  getResults() {
    return apiRequest("/jockeys/me/results");
  },

  getPrizeAwards(params = {}) {
    return apiRequest(withQuery("/prizes", params));
  },

  getStats() {
    return apiRequest("/jockeys/me/stats");
  },

  getViolations() {
    return apiRequest("/jockeys/me/violations");
  },
};
