const roleLabels = {
  admin: "Admin",
  horse_owner: "Horse Owner",
  jockey: "Jockey",
  race_referee: "Race Referee",
  spectator: "Spectator",
};

const statusLabels = {
  active: "Active",
  pending_verification: "Pending",
  blocked: "Suspended",
  disabled: "Suspended",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  draft: "Draft",
  confirmed: "Confirmed",
  published: "Published",
};

function asArray(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatNumber(value, suffix = "") {
  if (value === undefined || value === null || value === "") return "-";
  const number = Number(value);
  if (!Number.isNaN(number)) return `${number.toFixed(suffix === "s" ? 2 : 0)}${suffix}`;
  return `${value}${suffix}`;
}

function getUserFromEnvelope(item) {
  return item.user || item;
}

function getRoleLabel(role) {
  return roleLabels[role] || role;
}

function getStatusLabel(status) {
  return statusLabels[status] || status || "-";
}

const adminStatusPriority = {
  Pending: 0,
  Draft: 0,
  Unverified: 0,
  Confirmed: 1,
  Active: 1,
  Approved: 1,
  Verified: 1,
  Mixed: 2,
  Published: 3,
  Rejected: 4,
  Suspended: 4,
};

function statusPriority(status) {
  return adminStatusPriority[getStatusLabel(status)] ?? adminStatusPriority[status] ?? 9;
}

function dateTime(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getApplicationUser(application) {
  const user = application.user_id || application.user || {};
  return typeof user === "object" ? user : {};
}

function getApplicationTarget(application) {
  const data = application.application_data || {};
  return data.stable_name || data.license_number || data.accreditation_body || data.ownership_type || "Role access";
}

function getNamedEntity(value, fallback = {}) {
  if (!value || typeof value !== "object") return fallback;
  return value;
}

function getEntityId(value) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  return value._id || value.id || "-";
}

function getEntityName(value, fallback = "Unknown") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  // Horse Sequelize instance: { _id, name, registration_status, ... }
  if (value.name) return value.name;
  // Jockey Sequelize instance: { _id, user: { full_name }, full_name, ... }
  if (value.user?.full_name) return value.user.full_name;
  if (value.full_name) return value.full_name;
  // Horse/Jockey UUID string → treated as bare ID; caller should
  // use getRaceResultHorse/getRaceResultJockey first to get the populated object.
  return value.full_name || value.title || value.race_name || value.horse_name || fallback;
}

function unwrapResultDetailData(data) {
  if (data?.results && (data.readiness || data.participants || data.reports || data.violations || data.awards)) {
    return {
      resultsPayload: data.results,
      readiness: data.readiness || null,
      participantsPayload: data.participants || null,
      reportsPayload: data.reports || null,
      violationsPayload: data.violations || null,
      awardsPayload: data.awards || null,
    };
  }

  return {
    resultsPayload: data,
    readiness: null,
    participantsPayload: null,
    reportsPayload: null,
    violationsPayload: null,
    awardsPayload: null,
  };
}

function getParticipantRows(payload) {
  return asArray(payload, "participants");
}

function getRefereeReports(payload) {
  return asArray(payload, "referee_reports");
}

function getViolations(payload) {
  return asArray(payload, "violations");
}

function getPrizeAwards(payload) {
  return asArray(payload, "awards").concat(asArray(payload, "prize_awards"));
}

function getRaceResultHorse(result) {
  // Prefer the populated Horse instance from the repository include.
  // result.horse is the Sequelize instance (with .name etc.) when included.
  // result.horse_id is the UUID string (used when not populated).
  const named = result.horse || result.horse_id || {};
  if (typeof named === "object" && named !== null) return named;
  return {};
}

function getRaceResultJockey(result) {
  // Prefer the populated Jockey instance (with .user.full_name).
  // result.jockey is the Sequelize instance when included.
  // result.jockey_id is the UUID string (used when not populated).
  const named = result.jockey || result.jockey_id || {};
  if (typeof named === "object" && named !== null) return named;
  return {};
}

function getPenaltyLabel(violation) {
  const penalty = violation?.penalty || {};
  const type = penalty.type || violation?.penalty_type;

  if (!type) return "-";
  if (penalty.disqualified) return "Disqualification";
  if (penalty.time_penalty_seconds) return `${getStatusLabel(type)} +${penalty.time_penalty_seconds}s`;
  if (penalty.position_delta) return `${getStatusLabel(type)} +${penalty.position_delta} position`;
  if (penalty.score_deduction) return `${getStatusLabel(type)} -${penalty.score_deduction} score`;
  if (penalty.suspension_days) return `${getStatusLabel(type)} ${penalty.suspension_days} days`;
  if (penalty.fine_amount) return `${getStatusLabel(type)} ${penalty.fine_amount}`;
  return getStatusLabel(type);
}

function getAwardRecipient(award) {
  return getEntityName(award.owner_id || award.owner || award.recipient_id || award.recipient, "-");
}

function unwrapRegistrations(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.registrations)) return data.registrations;
  if (Array.isArray(data?.data?.registrations)) return data.data.registrations;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function getRegistrationHorse(registration) {
  return getNamedEntity(registration.horse || registration.horse_id || registration.horseId, {});
}

function getRegistrationRace(registration) {
  return getNamedEntity(registration.race || registration.race_id || registration.raceId, {});
}

function getRegistrationTournament(registration) {
  const race = getRegistrationRace(registration);
  return getNamedEntity(
    registration.tournament || registration.tournament_id || registration.tournamentId || race.tournament || race.tournament_id,
    {},
  );
}

function getRegistrationOwner(registration) {
  const horse = getRegistrationHorse(registration);
  return getNamedEntity(registration.owner || registration.owner_id || registration.ownerId || horse.owner || horse.owner_id, {});
}

function getRegistrationTitle(registration) {
  const horseName = getEntityName(getRegistrationHorse(registration), "Horse");
  const raceName = getEntityName(getRegistrationRace(registration), "Race");
  return `${horseName} -> ${raceName}`;
}

export function adaptAdminUserDetail(data) {
  const user = data?.user || {};
  const roles = asArray(data?.roles);
  const profiles = data?.profiles || {};

  return {
    type: "user",
    id: user._id || user.id || "-",
    title: user.full_name || user.email || "User account",
    fields: [
      ["Email", user.email || "-"],
      ["Phone", user.phone_number || "-"],
      ["Status", getStatusLabel(user.status)],
      ["Verification", user.email_verified ? "Verified" : "Unverified"],
      ["Created", formatDate(user.created_at)],
      ["Updated", formatDate(user.updated_at)],
    ],
    roles,
    profiles: Object.entries(profiles).map(([role, profile]) => ({
      role,
      label: getRoleLabel(role),
      id: profile?._id || profile?.id || "-",
      status: getStatusLabel(profile?.status),
      values: Object.entries(profile || {}).filter(([key]) => !["_id", "id", "user_id", "status"].includes(key)),
    })),
  };
}

export function adaptRoleApplicationDetail(data) {
  const application = data?.application || data || {};
  const user = getApplicationUser(application);
  const applicationData = application.application_data || {};

  return {
    type: "application",
    id: application._id || application.id || "-",
    title: user.full_name || user.email || "Role application",
    fields: [
      ["Applicant email", user.email || application.user_email || "-"],
      ["Requested role", getRoleLabel(application.requested_role)],
      ["Status", getStatusLabel(application.status)],
      ["Submitted", formatDate(application.created_at)],
      ["Reviewed", formatDate(application.reviewed_at)],
      ["Admin note", application.admin_note || "-"],
    ],
    applicationData: Object.entries(applicationData),
    documents: asArray(application.documents),
  };
}

export function adaptAdminUsers(data) {
  const users = asArray(data, "users").slice().sort((first, second) => {
    const firstUser = getUserFromEnvelope(first);
    const secondUser = getUserFromEnvelope(second);
    return statusPriority(firstUser.email_verified ? "Verified" : "Unverified") - statusPriority(secondUser.email_verified ? "Verified" : "Unverified")
      || statusPriority(firstUser.status) - statusPriority(secondUser.status)
      || dateTime(secondUser.created_at) - dateTime(firstUser.created_at);
  });
  const rows = users.map((item) => {
    const user = getUserFromEnvelope(item);
    const roles = asArray(item.roles || user.roles).map(getRoleLabel);
    const verification = user.email_verified ? "Verified" : "Unverified";

    return [
      user._id || user.id || "-",
      user.full_name || user.email || "Unknown user",
      roles.length ? roles.join(", ") : "No role",
      getStatusLabel(user.status),
      verification,
    ];
  });

  const activeCount = rows.filter((row) => row[3] === "Active").length;
  const pendingCount = rows.filter((row) => row[3] === "Pending").length;
  const roleCount = rows.reduce((total, row) => total + row[2].split(",").filter(Boolean).length, 0);

  return {
    summary: [
      { label: "Active users", value: String(activeCount) },
      { label: "Pending reviews", value: String(pendingCount) },
      { label: "Assigned roles", value: String(roleCount) },
    ],
    tables: [
      {
        title: "User accounts",
        columns: ["ID", "Name", "Role", "Status", "Verification"],
        rows,
      },
    ],
  };
}

export function adaptRoleApplications(data) {
  const applications = asArray(data, "applications");
  const rows = applications.map((application) => {
    const user = getApplicationUser(application);
    return [
      application._id || application.id || "-",
      user.full_name || user.email || application.user_email || "Applicant",
      getRoleLabel(application.requested_role),
      getApplicationTarget(application),
      formatDate(application.created_at),
      getStatusLabel(application.status),
    ];
  });

  return {
    summary: [
      { label: "Waiting approval", value: String(rows.filter((row) => row[5] === "Pending").length) },
      { label: "Approved requests", value: String(rows.filter((row) => row[5] === "Approved").length) },
      { label: "Rejected requests", value: String(rows.filter((row) => row[5] === "Rejected").length) },
    ],
    tables: [
      {
        title: "Role application queue",
        columns: ["Reg ID", "Participant", "Role", "Target", "Submitted", "Status"],
        rows,
      },
    ],
  };
}

export function adaptRaceRegistrationDetail(data) {
  const registration = data?.registration || data?.data?.registration || data?.data || data || {};
  const horse = getRegistrationHorse(registration);
  const race = getRegistrationRace(registration);
  const tournament = getRegistrationTournament(registration);
  const owner = getRegistrationOwner(registration);

  return {
    type: "raceRegistration",
    id: registration._id || registration.id || "-",
    title: getRegistrationTitle(registration),
    fields: [
      ["Horse", getEntityName(horse, registration.horse_name || "Unknown horse")],
      ["Horse ID", getEntityId(registration.horse_id || horse)],
      ["Race", getEntityName(race, registration.race_name || "Unknown race")],
      ["Race ID", getEntityId(registration.race_id || race)],
      ["Tournament", getEntityName(tournament, registration.tournament_name || "-")],
      ["Owner", getEntityName(owner, registration.owner_email || "Unknown owner")],
      ["Owner ID", getEntityId(registration.owner_id || owner)],
      ["Status", getStatusLabel(registration.status)],
      ["Registered", formatDate(registration.registered_at || registration.created_at || registration.submitted_at)],
      ["Confirmed", formatDate(registration.approved_at)],
      ["Entry fee", Number(registration.entry_fee_vnd || 0) > 0 ? `${Number(registration.entry_fee_vnd).toLocaleString("en-US")} VND` : "No fee required"],
      ["Payment", getStatusLabel(registration.payment_status || "not_required")],
      ["Owner note", registration.note || "-"],
    ],
  };
}

export function adaptRaceRegistrations(data) {
  const registrations = unwrapRegistrations(data).slice().sort((first, second) => (
    dateTime(second.registered_at || second.created_at || second.submitted_at) - dateTime(first.registered_at || first.created_at || first.submitted_at)
  ));
  const rows = registrations.map((registration) => {
    const horse = getRegistrationHorse(registration);
    const race = getRegistrationRace(registration);
    const tournament = getRegistrationTournament(registration);
    const target = [
      getEntityName(race, registration.race_name || "Race"),
      getEntityName(tournament, registration.tournament_name || ""),
    ].filter(Boolean).join(" / ");

    return [
      registration._id || registration.id || "-",
      getEntityName(horse, registration.horse_name || "Horse"),
      "Horse Race Entry",
      target || "-",
      formatDate(registration.registered_at || registration.created_at || registration.submitted_at),
      getStatusLabel(registration.status),
    ];
  });

  return {
    summary: [
      { label: "Total entries", value: String(rows.length) },
      { label: "Confirmed entries", value: String(rows.filter((row) => row[5] === "Approved").length) },
      { label: "Paid entries", value: String(registrations.filter((registration) => registration.payment_status === "paid").length) },
    ],
    tables: [
      {
        title: "Race entry ledger",
        columns: ["Reg ID", "Participant", "Role", "Target", "Registered", "Status"],
        rows,
      },
    ],
  };
}

function getRaceResultRows(data) {
  return asArray(data, "results");
}

function getRaceResultRace(result) {
  return getNamedEntity(result.race || result.race_id, {});
}

function groupRaceResults(data) {
  return getRaceResultRows(data).reduce((groups, result) => {
    const race = getRaceResultRace(result);
    const raceId = getEntityId(race);
    if (!groups.has(raceId)) groups.set(raceId, { race, results: [] });
    groups.get(raceId).results.push(result);
    return groups;
  }, new Map());
}

function getGroupStatus(results) {
  const statuses = [...new Set(results.map((result) => String(result.status || "draft").toLowerCase()))];
  return statuses.length === 1 ? getStatusLabel(statuses[0]) : "Mixed";
}

function getLeadingResult(results) {
  return results.find((result) => (result.final_position ?? result.position) === 1) || null;
}

export function adaptAdminRaceResults(data) {
  const groups = [...groupRaceResults(data).entries()].sort(([, firstGroup], [, secondGroup]) => {
    const firstStatus = getGroupStatus(firstGroup.results);
    const secondStatus = getGroupStatus(secondGroup.results);
    const firstNewest = Math.max(...firstGroup.results.map((result) => dateTime(result.published_at || result.recorded_at || result.confirmed_at)));
    const secondNewest = Math.max(...secondGroup.results.map((result) => dateTime(result.published_at || result.recorded_at || result.confirmed_at)));
    return statusPriority(firstStatus) - statusPriority(secondStatus) || secondNewest - firstNewest;
  });
  const rows = groups.map(([raceId, group]) => {
    const race = group.race;
    const leader = getLeadingResult(group.results);
    const tournamentName = race?.tournament?.name || race?.round?.name || race?.tournament_id || race?.round_id || "-";
    return [
      raceId,
      race?.name || race?.race_name || "Unnamed race",
      tournamentName,
      getEntityName(getRaceResultHorse(leader), "Not ranked"),
      String(group.results.length),
      getGroupStatus(group.results),
    ];
  });

  return {
    summary: [
      { label: "Draft races", value: String(rows.filter((row) => row[5] === "Draft").length) },
      { label: "Confirmed races", value: String(rows.filter((row) => row[5] === "Confirmed").length) },
      { label: "Published races", value: String(rows.filter((row) => row[5] === "Published").length) },
    ],
    tables: [{
      title: "Authoritative race results",
      columns: ["Race ID", "Race", "Tournament", "Leader", "Runners", "Status"],
      rows,
    }],
  };
}

export function adaptAdminRaceResultDetail(data) {
  const {
    resultsPayload,
    readiness,
    participantsPayload,
    reportsPayload,
    violationsPayload,
    awardsPayload,
  } = unwrapResultDetailData(data);
  const results = getRaceResultRows(resultsPayload);
  const race = getRaceResultRace(results[0] || {});
  const leader = getLeadingResult(results);
  const appliedViolations = results.reduce((total, result) => total + asArray(result.applied_violation_ids).length, 0);
  const reports = getRefereeReports(reportsPayload);
  const submittedReport = reports.find((report) => report.status === "submitted") || reports[0] || {};
  const participants = getParticipantRows(participantsPayload);
  const violations = getViolations(violationsPayload);
  const correctionRequested = results.some((result) => result.correction_requested === true);
  const correctionSource = results.find((result) => result.correction_requested === true || result.correction_note) || {};
  const unresolvedViolations = violations.filter((violation) => !["confirmed", "dismissed"].includes(String(violation.status || "").toLowerCase()));
  const awards = getPrizeAwards(awardsPayload);
  const missingPostChecks = asArray(readiness?.missing_post_check_horse_ids);
  const underInvestigation = asArray(readiness?.under_investigation_horse_ids);
  const readinessWarnings = [
    correctionRequested ? "Admin correction is requested. Resolve it before confirming results." : "",
    readiness?.missing_report ? "Referee report has not been submitted." : "",
    missingPostChecks.length ? `${missingPostChecks.length} post-race check(s) missing.` : "",
    underInvestigation.length ? `${underInvestigation.length} horse(s) still under investigation.` : "",
    unresolvedViolations.length ? `${unresolvedViolations.length} unresolved violation(s).` : "",
  ].filter(Boolean);
  const resultRows = [...results]
    .sort((first, second) => (first.final_position ?? first.position ?? 9999) - (second.final_position ?? second.position ?? 9999))
    .map((result) => {
      const rawPosition = result.raw_position ?? result.position;
      const finalPosition = result.final_position ?? result.position;
      const applied = asArray(result.applied_violation_ids).length;
      return [
        finalPosition ? `#${finalPosition}` : "DQ",
        getEntityName(getRaceResultHorse(result), "Unknown horse"),
        getEntityName(getRaceResultJockey(result), "-"),
        rawPosition ? `#${rawPosition}` : "-",
        formatNumber(result.raw_finish_time ?? result.finish_time, "s"),
        formatNumber(result.final_finish_time ?? result.finish_time, "s"),
        String(applied),
      ];
    });
  const participantRows = participants.map((participant) => [
    getEntityName(participant.horse || participant.horse_id, "Unknown horse"),
    getEntityName(participant.jockey || participant.jockey_id, "-"),
    getStatusLabel(participant.pre_race_check?.status || "missing"),
    getStatusLabel(participant.post_race_check?.status || "missing"),
    participant.eligible ? "Eligible" : "Blocked",
    asArray(participant.blockers).map(getStatusLabel).join(", ") || "None",
  ]);
  const violationRows = violations.map((violation) => [
    getStatusLabel(violation.violation_type),
    getEntityName(violation.horse_id || violation.horse, "-"),
    getEntityName(violation.jockey_id || violation.jockey, "-"),
    getStatusLabel(violation.severity),
    getStatusLabel(violation.status),
    getPenaltyLabel(violation),
  ]);
  const awardRows = awards.map((award) => [
    award.position ? `#${award.position}` : getStatusLabel(award.award_type || "award"),
    getEntityName(award.horse_id || award.horse, "-"),
    getAwardRecipient(award),
    formatNumber(award.amount || award.prize_amount),
    getStatusLabel(award.status),
  ]);

  return {
    type: "raceResults",
    id: getEntityId(race),
    title: getEntityName(race, "Race results"),
    correctionRequested,
    fields: [
      ["Tournament", getEntityName(race.tournament_id || race.tournament, "-")],
      ["Round", getEntityName(race.round_id || race.round, "-")],
      ["Race date", formatDateTime(race.race_date || race.start_time)],
      ["Race status", getStatusLabel(race.status)],
      ["Result status", getGroupStatus(results)],
      ["Correction", correctionRequested ? "Requested" : "Clear"],
      ["Correction note", correctionSource.correction_note || "-"],
      ["Correction requested by", getEntityName(correctionSource.correction_requested_by, "-")],
      ["Correction requested at", formatDateTime(correctionSource.correction_requested_at)],
      ["Result rows", String(results.length)],
      ["Current leader", getEntityName(getRaceResultHorse(leader), "Not ranked")],
      ["Leader finish time", (() => {
        if (!leader) return "-";
        const val = leader.final_finish_time ?? leader.finish_time;
        if (val === null || val === undefined || val === "") return "-";
        const num = Number(val);
        return !Number.isNaN(num) ? `${num.toFixed(2)}s` : `${val}s`;
      })()],
      ["Applied violations", String(appliedViolations)],
      ["Confirmed at", formatDate(results[0]?.confirmed_at)],
      ["Published at", formatDate(results[0]?.published_at)],
    ],
    warnings: readinessWarnings,
    sections: [
      {
        title: "Referee report",
        fields: [
          ["Status", getStatusLabel(submittedReport.status || "missing")],
          ["Title", submittedReport.report_title || "-"],
          ["Weather", submittedReport.weather || "-"],
          ["Track condition", submittedReport.track_condition || "-"],
          ["Race condition", submittedReport.race_condition || "-"],
          ["Submitted at", formatDateTime(submittedReport.submitted_at)],
          ["Conclusion", submittedReport.conclusion || "-"],
        ],
      },
      {
        title: "Readiness gate",
        fields: [
          ["Ready to confirm", readiness?.ready ? "Yes" : "No"],
          ["Eligible participants", String(readiness?.eligible_participant_count ?? participants.length ?? 0)],
          ["Missing post checks", String(missingPostChecks.length)],
          ["Under investigation", String(underInvestigation.length)],
          ["Unresolved violations", String(unresolvedViolations.length)],
        ],
      },
    ],
    tables: [
      {
        title: "Raw vs final result",
        columns: ["Final", "Horse", "Jockey", "Raw", "Raw time", "Final time", "Violations"],
        rows: resultRows,
        emptyText: "No draft result rows are available yet.",
      },
      {
        title: "Participant audit",
        columns: ["Horse", "Jockey", "Pre-check", "Post-check", "Eligibility", "Blockers"],
        rows: participantRows,
        emptyText: "No participant audit data returned.",
      },
      {
        title: "Violation and penalty review",
        columns: ["Type", "Horse", "Jockey", "Severity", "Status", "Penalty"],
        rows: violationRows,
        emptyText: "No violations were recorded for this race.",
      },
      {
        title: "Prize award impact",
        columns: ["Place", "Horse", "Recipient", "Amount", "Status"],
        rows: awardRows,
        emptyText: "Prize awards are not calculated yet.",
      },
    ],
  };
}
