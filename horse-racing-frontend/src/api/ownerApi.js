import { apiRequest } from "./client";

export const ownerApi = {
  getProfile() {
    return apiRequest("/horse-owner/profile");
  },

  updateProfile(payload) {
    return apiRequest("/horse-owner/profile", {
      method: "PATCH",
      body: payload,
    });
  },

  getHorses() {
    return apiRequest("/horse-owner/horses");
  },

  getHorse(horseId) {
    return apiRequest(`/horse-owner/horses/${horseId}`);
  },

  createHorse(payload) {
    return apiRequest("/horse-owner/horses", {
      method: "POST",
      body: payload,
    });
  },

  updateHorse(horseId, payload) {
    return apiRequest(`/horse-owner/horses/${horseId}`, {
      method: "PATCH",
      body: payload,
    });
  },

  deactivateHorse(horseId) {
    return apiRequest(`/horse-owner/horses/${horseId}`, {
      method: "DELETE",
    });
  },

  updateHorseMedia(horseId, payload) {
    return apiRequest(`/horse-owner/horses/${horseId}/media`, {
      method: "PATCH",
      body: payload,
    });
  },

  getHorseApprovalStatus(horseId) {
    return apiRequest(`/horse-owner/horses/${horseId}/approval-status`);
  },

  getJockeys(raceId = "") {
    const query = raceId ? `?race_id=${encodeURIComponent(raceId)}` : "";
    return apiRequest(`/horse-owner/jockeys${query}`);
  },

  getJockey(jockeyId) {
    return apiRequest(`/horse-owner/jockeys/${jockeyId}`);
  },

  getTournaments() {
    return apiRequest("/horse-owner/tournaments");
  },

  getTournamentRaces(tournamentId) {
    return apiRequest(`/horse-owner/tournaments/${tournamentId}/races`);
  },

  getRaceRounds(raceId) {
    return apiRequest(`/horse-owner/races/${raceId}/rounds`);
  },

  getEligibleHorses(raceId) {
    return apiRequest(`/horse-owner/races/${raceId}/eligible-horses`);
  },

  registerHorseForRace(payload) {
    return apiRequest("/horse-owner/race-registrations", {
      method: "POST",
      body: payload,
    });
  },

  updateRaceEntryDetails(registrationId, payload) {
    return apiRequest(`/horse-owner/race-registrations/${registrationId}/entry-details`, {
      method: "PATCH",
      body: payload,
    });
  },

  getRegistrationPayment(orderId) {
    return apiRequest(`/horse-owner/registration-payments/${encodeURIComponent(orderId)}`);
  },

  createCancellationTicket(registrationId, reason) {
    return apiRequest("/horse-owner/registration-cancellation-tickets", {
      method: "POST",
      body: { registration_id: registrationId, reason },
    });
  },

  getCancellationTickets(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ).toString();
    return apiRequest(`/horse-owner/registration-cancellation-tickets${query ? `?${query}` : ""}`);
  },

  getCancellationTicket(id) {
    return apiRequest(`/horse-owner/registration-cancellation-tickets/${id}`);
  },

  confirmRefundReceipt(id, confirmationNote = "") {
    return apiRequest(`/horse-owner/registration-cancellation-tickets/${id}/confirm-refund`, {
      method: "POST",
      body: { confirmation_note: confirmationNote },
    });
  },

  getRegistrations(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ).toString();

    return apiRequest(`/registrations${query ? `?${query}` : ""}`);
  },

  getPrizeAwards(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ).toString();

    return apiRequest(`/prizes${query ? `?${query}` : ""}`);
  },

  createJockeyAssignment(payload) {
    return apiRequest("/jockey-assignments", {
      method: "POST",
      body: payload,
    });
  },

  getJockeyAssignments(params = {}) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
    ).toString();

    return apiRequest(`/jockey-assignments${query ? `?${query}` : ""}`);
  },

  updateJockeyAssignmentTerms(id, payload) {
    return apiRequest(`/jockey-assignments/${id}/terms`, {
      method: "PATCH",
      body: payload,
    });
  },

  uploadJockeyAssignmentContract(id, contract) {
    return apiRequest(`/jockey-assignments/${id}/contract`, {
      method: "POST",
      body: { contract },
    });
  },

  promoteJockeyAssignment(id, reason) {
    return apiRequest(`/jockey-assignments/${id}/promote`, {
      method: "POST",
      body: { reason },
    });
  },

  cancelJockeyAssignment(id) {
    return apiRequest(`/jockey-assignments/${id}/cancel`, {
      method: "POST",
    });
  },

  withdrawJockeyAssignment(id, reason) {
    return apiRequest(`/jockey-assignments/${id}/withdraw`, {
      method: "POST",
      body: { reason },
    });
  },

  requestJockeyAssignmentCancellation(id, reason) {
    return apiRequest(`/jockey-assignments/${id}/cancellation-request`, {
      method: "POST",
      body: { reason },
    });
  },

  respondToJockeyAssignmentCancellation(id, decision, responseMessage = "") {
    return apiRequest(`/jockey-assignments/${id}/cancellation-request/respond`, {
      method: "POST",
      body: { decision, response_message: responseMessage },
    });
  },
};
