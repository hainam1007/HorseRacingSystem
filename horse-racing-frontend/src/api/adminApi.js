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

export const adminApi = {
  getDashboard(params = {}) {
    return apiRequest(withQuery("/admin/dashboard", params));
  },

  getRoleAnalytics(params = {}) {
    return apiRequest(withQuery("/admin/role-analytics", params));
  },

  getCashflowMatrix(params = {}) {
    return apiRequest(withQuery("/admin/cashflow-matrix", params));
  },

  getEquineDirectory(params = {}) {
    return apiRequest(withQuery("/admin/equine-directory", params));
  },

  getBettingSummary(params = {}) {
    return apiRequest(withQuery("/admin/betting-summary", params));
  },

  getDepositRequests(params = {}) {
    return apiRequest(withQuery("/admin/deposit-requests", params));
  },

  getPrizeAwardsSummary(params = {}) {
    return apiRequest(withQuery("/admin/prize-awards/summary", params));
  },

  getRewardStatistics() {
    return apiRequest("/admin/rewards/statistics");
  },

  listRewards(params = {}) {
    return apiRequest(withQuery("/admin/rewards", params));
  },

  getReward(id) {
    return apiRequest(`/admin/rewards/${id}`);
  },

  createReward(payload) {
    return apiRequest("/admin/rewards", { method: "POST", body: payload });
  },

  updateReward(id, payload) {
    return apiRequest(`/admin/rewards/${id}`, { method: "PUT", body: payload });
  },

  updateRewardStock(id, payload) {
    return apiRequest(`/admin/rewards/${id}/stock`, { method: "PATCH", body: payload });
  },

  updateRewardStatus(id, isActive) {
    return apiRequest(`/admin/rewards/${id}/status`, {
      method: "PATCH",
      body: { is_active: isActive },
    });
  },

  listRewardRedemptions(params = {}) {
    return apiRequest(withQuery("/admin/rewards/redemptions", params));
  },

  updateRewardRedemptionStatus(id, status) {
    return apiRequest(`/admin/rewards/redemptions/${id}/status`, {
      method: "PATCH",
      body: { status },
    });
  },

  listUsers(params = {}) {
    return apiRequest(withQuery("/admin/users", params));
  },

  getUser(id) {
    return apiRequest(`/admin/users/${id}`);
  },

  updateUserStatus(id, status) {
    return apiRequest(`/admin/users/${id}/status`, {
      method: "PATCH",
      body: { status },
    });
  },

  assignUserRole(id, roleName) {
    return apiRequest(`/admin/users/${id}/roles`, {
      method: "POST",
      body: { role_name: roleName },
    });
  },

  removeUserRole(id, roleName) {
    return apiRequest(`/admin/users/${id}/roles/${roleName}`, {
      method: "DELETE",
    });
  },

  listRoleApplications(params = {}) {
    return apiRequest(withQuery("/admin/role-applications", params));
  },

  getRoleApplication(id) {
    return apiRequest(`/admin/role-applications/${id}`);
  },

  approveRoleApplication(id, adminNote = "Documents verified") {
    return apiRequest(`/admin/role-applications/${id}/approve`, {
      method: "POST",
      body: { admin_note: adminNote },
    });
  },

  rejectRoleApplication(id, adminNote = "Rejected by admin review") {
    return apiRequest(`/admin/role-applications/${id}/reject`, {
      method: "POST",
      body: { admin_note: adminNote },
    });
  },

  listRegistrations(params = {}) {
    return apiRequest(withQuery("/registrations", params));
  },

  getRegistration(id) {
    return apiRequest(`/registrations/${id}`);
  },

  listCancellationTickets(params = {}) {
    return apiRequest(withQuery("/admin/registration-cancellation-tickets", params));
  },

  getCancellationTicket(id) {
    return apiRequest(`/admin/registration-cancellation-tickets/${id}`);
  },

  approveCancellationTicket(id, adminNote = "") {
    return apiRequest(`/admin/registration-cancellation-tickets/${id}/approve`, {
      method: "POST",
      body: { admin_note: adminNote },
    });
  },

  rejectCancellationTicket(id, adminNote = "") {
    return apiRequest(`/admin/registration-cancellation-tickets/${id}/reject`, {
      method: "POST",
      body: { admin_note: adminNote },
    });
  },

  markCancellationRefundSent(id, refundReference, adminNote = "") {
    return apiRequest(`/admin/registration-cancellation-tickets/${id}/mark-refunded`, {
      method: "POST",
      body: { refund_reference: refundReference, admin_note: adminNote },
    });
  },

  listRaceResults(params = {}) {
    return apiRequest(withQuery("/race-results", params));
  },

  getRaceResultParticipants(raceId) {
    return apiRequest(`/race-results/races/${raceId}/participants`);
  },

  getRaceResultReadiness(raceId) {
    return apiRequest(`/race-results/races/${raceId}/readiness`);
  },

  requestRaceResultCorrection(raceId, correctionNote) {
    return apiRequest(`/race-results/races/${raceId}/request-correction`, {
      method: "POST",
      body: { correction_note: correctionNote },
    });
  },

  resolveRaceResultCorrection(raceId) {
    return apiRequest(`/race-results/races/${raceId}/resolve-correction`, { method: "POST" });
  },

  configureRacePrizes(raceId, payload) {
    return apiRequest(`/prizes/races/${raceId}/config`, { method: "POST", body: payload });
  },

  listRacePrizeAwards(raceId) {
    return apiRequest(`/prizes/races/${raceId}/awards`);
  },

  listRefereeReports(params = {}) {
    return apiRequest(withQuery("/referee-reports", params));
  },

  listViolations(params = {}) {
    return apiRequest(withQuery("/violations", params));
  },

  getViolationOptions() {
    return apiRequest("/violations/options");
  },

  listJockeyAssignments(params = {}) {
    return apiRequest(withQuery("/jockey-assignments", params));
  },

  getViolation(id) {
    return apiRequest(`/violations/${id}`);
  },

  updateViolation(id, payload) {
    return apiRequest(`/violations/${id}`, { method: "PATCH", body: payload });
  },

  confirmViolation(id, payload) {
    const body = typeof payload === "string" ? { decision: payload } : payload;
    return apiRequest(`/violations/${id}/confirm`, { method: "POST", body });
  },

  dismissViolation(id, decision) {
    return apiRequest(`/violations/${id}/dismiss`, { method: "POST", body: { decision } });
  },

  listHorseChecks(params = {}) {
    return apiRequest(withQuery("/horse-checks", params));
  },

  updateHorseCheck(id, payload) {
    return apiRequest(`/horse-checks/${id}`, { method: "PATCH", body: payload });
  },

  listTournaments(params = {}) {
    return apiRequest(withQuery("/tournaments", params));
  },

  getTournament(id) {
    return apiRequest(`/tournaments/${id}`);
  },

  createTournament(payload) {
    return apiRequest("/tournaments", { method: "POST", body: payload });
  },

  updateTournament(id, payload) {
    return apiRequest(`/tournaments/${id}`, { method: "PATCH", body: payload });
  },

  deleteTournament(id) {
    return apiRequest(`/tournaments/${id}`, { method: "DELETE" });
  },

  listRounds(params = {}) {
    return apiRequest(withQuery("/rounds", params));
  },

  getRound(id) {
    return apiRequest(`/rounds/${id}`);
  },

  createRound(payload) {
    return apiRequest("/rounds", { method: "POST", body: payload });
  },

  updateRound(id, payload) {
    return apiRequest(`/rounds/${id}`, { method: "PATCH", body: payload });
  },

  deleteRound(id) {
    return apiRequest(`/rounds/${id}`, { method: "DELETE" });
  },

  listRaces(params = {}) {
    return apiRequest(withQuery("/races", params));
  },

  listRacetracks(params = {}) {
    return apiRequest(withQuery("/racetracks", params));
  },

  getRacetrack(id) {
    return apiRequest(`/racetracks/${id}`);
  },

  createRacetrack(payload) {
    return apiRequest("/racetracks", { method: "POST", body: payload });
  },

  updateRacetrack(id, payload) {
    return apiRequest(`/racetracks/${id}`, { method: "PATCH", body: payload });
  },

  archiveRacetrack(id) {
    return apiRequest(`/racetracks/${id}/archive`, { method: "POST" });
  },

  getRace(id) {
    return apiRequest(`/races/${id}`);
  },

  getRaceModelInputReadiness(id) {
    return apiRequest(`/races/${id}/model-input-readiness`);
  },

  finalizeRaceEntries(id) {
    return apiRequest(`/races/${id}/entries/finalize`, { method: "POST" });
  },

  updateRaceEntry(id, payload) {
    return apiRequest(`/registrations/${id}/race-entry`, { method: "PATCH", body: payload });
  },

  updateHorseRating(id, payload) {
    return apiRequest(`/admin/horses/${id}/rating`, { method: "PATCH", body: payload });
  },

  getHorseRatingHistory(id) {
    return apiRequest(`/admin/horses/${id}/rating-history`);
  },

  generateRaceOdds(id) {
    return apiRequest(`/races/${id}/odds/generate`, { method: "POST" });
  },

  getRaceOdds(id) {
    return apiRequest(`/races/${id}/odds`);
  },

  updateRaceOdds(id, payload) {
    return apiRequest(`/races/${id}/odds`, { method: "PATCH", body: payload });
  },

  openRaceBetting(id, payload = {}) {
    return apiRequest(`/races/${id}/betting/open`, { method: "POST", body: payload });
  },

  closeRaceBetting(id) {
    return apiRequest(`/races/${id}/betting/close`, { method: "POST" });
  },

  createRace(payload) {
    return apiRequest("/races", { method: "POST", body: payload });
  },

  updateRace(id, payload) {
    return apiRequest(`/races/${id}`, { method: "PATCH", body: payload });
  },

  openRaceRegistrationDemo(id) {
    return apiRequest(`/races/${id}/open-registration-demo`, { method: "POST" });
  },

  setRaceRegistrationDemoMode(enabled) {
    return apiRequest("/races/registration-demo-mode", {
      method: "POST",
      body: { enabled },
    });
  },

  prepareRaceDemoTimeline(id, payload) {
    return apiRequest(`/races/${id}/demo-timeline`, { method: "POST", body: payload });
  },

  lockRaceRegistrationForDemo(id) {
    return apiRequest(`/races/${id}/demo-timeline/lock`, { method: "POST" });
  },

  deleteRace(id) {
    return apiRequest(`/races/${id}`, { method: "DELETE" });
  },
};
