const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function asArray(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function getId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function getName(value, fallback = "Unknown") {
  if (!value) return fallback;
  if (typeof value === "string") {
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    return looksLikeUuid ? fallback : value;
  }
  return value.name || value.full_name || value.stable_name || value.title || fallback;
}

function formatRaceTime(value) {
  if (!value) return "Race day, TBA";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return `${monthFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

function normalizeStatus(status, fallback = "Pending") {
  const value = String(status || fallback).toLowerCase();
  const map = {
    pending: "Pending",
    meeting_invited: "Appointment invite",
    meeting_accepted: "Appointment accepted",
    meeting_rejected: "Appointment rejected",
    terms_pending_confirmation: "Terms review",
    standby_terms_pending_confirmation: "Standby terms review",
    standby_confirmed: "Standby confirmed",
    terms_agreed: "Terms confirmed",
    terms_rejected: "Terms rejected",
    contract_uploaded: "Contract review",
    contract_rejected: "Contract rejected",
    accepted: "Accepted",
    replaced: "Replaced",
    approved: "Accepted",
    confirmed: "Accepted",
    rejected: "Rejected",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    review: "Review",
    draft: "Draft",
    published: "Published",
    active: "Available",
    inactive: "Unavailable",
  };

  return map[value] || value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMoney(value, currency = "VND") {
  const amount = Number(value || 0);

  if (!amount) return "-";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2,
  }).format(amount);
}

function normalizeAssignmentStatus(item) {
  const status = item.status || "";

  if (item.assignment_type !== "backup") {
    return status === "pending" ? "meeting_invited" : status === "rejected" ? "meeting_rejected" : status;
  }

  if (["pending"].includes(status)) return "meeting_invited";
  if (["rejected"].includes(status)) return "meeting_rejected";
  if (status === "terms_pending_confirmation") return "standby_terms_pending_confirmation";
  if (["terms_agreed", "contract_uploaded", "accepted"].includes(status)) return "standby_confirmed";
  return status;
}

function mapAssignment(item, index = 0) {
  const race = (item.race && typeof item.race === "object") ? item.race : (item.race_id && typeof item.race_id === "object" ? item.race_id : {});
  const horse = (item.horse && typeof item.horse === "object") ? item.horse : (item.horse_id && typeof item.horse_id === "object" ? item.horse_id : {});
  const owner = (item.owner && typeof item.owner === "object")
    ? item.owner
    : (item.owner_id && typeof item.owner_id === "object" ? item.owner_id : (horse && horse.owner_id && typeof horse.owner_id === "object" ? horse.owner_id : {}));
  const meeting = item.meeting || {};
  const contract = item.contract || {};
  const cancellationRequest = item.cancellation_request || null;
  const withdrawal = item.withdrawal || null;
  const assignmentType = item.assignment_type || "primary";
  const rawStatus = normalizeAssignmentStatus({ ...item, assignment_type: assignmentType });
  const status = normalizeStatus(rawStatus);
  const raceStatus = String(race.status || item.race_status || "").toLowerCase();
  const actionsLocked = [
    "starting",
    "started",
    "running",
    "ongoing",
    "in_progress",
    "completed",
    "finished",
    "cancelled",
    "archived",
  ].includes(raceStatus);

  return {
    id: getId(item) || `ASG-${index + 1}`,
    horse: getName(horse, item.horse_name || `Horse ${index + 1}`),
    owner: getName(owner, item.owner_name || "Race owner"),
    status,
    assignmentType,
    assignmentTypeLabel: assignmentType === "backup" ? "Backup jockey" : "Primary jockey",
    isBackup: assignmentType === "backup",
    backupPriority: item.backup_priority || "",
    race: getName(race, item.race_name || "Assigned race"),
    tournament: getName(race.tournament_id || race.tournament || item.tournament_id, item.tournament_name || "Tournament"),
    date: formatRaceTime(race.race_date || item.race_date || item.created_at),
    venue: race.location || item.location || "Race track",
    round: getName(race.round_id || race.round || item.round_id, item.round_name || "Race round"),
    note: item.invitation_message || item.response_message || item.note || "Owner invitation is ready for review.",
    rawStatus,
    sourceStatus: item.status || "",
    raceStatus,
    actionsLocked,
    meetingTitle: meeting.title || item.meeting_title || "Owner appointment",
    meetingUrl: meeting.meeting_url || item.meeting_url || "",
    meetingTime: formatRaceTime(meeting.meeting_time || item.meeting_time),
    locationName: meeting.location_name || item.location_name || "",
    address: meeting.address || item.address || "",
    city: meeting.city || item.city || "",
    district: meeting.district || item.district || "",
    ward: meeting.ward || item.ward || "",
    mapUrl: meeting.map_url || item.map_url || "",
    contactName: meeting.contact_name || item.contact_name || "",
    contactPhone: meeting.contact_phone || item.contact_phone || "",
    contractUrl: contract.file_url || item.contract_url || item.contract_link || "",
    contractFileName: contract.file_name || item.contract_file_name || "",
    terms: item.terms?.agreed_terms || item.agreed_terms || "",
    meetingNote: item.terms?.meeting_note || "",
    responseMessage: contract.response_message || meeting.response_message || item.response_message || "",
    cancellationRequest,
    withdrawal,
  };
}

function mapResult(item, index = 0) {
  const race = (item.race && typeof item.race === "object") ? item.race : (item.race_id && typeof item.race_id === "object" ? item.race_id : {});
  const horse = (item.horse && typeof item.horse === "object") ? item.horse : (item.horse_id && typeof item.horse_id === "object" ? item.horse_id : {});
  const position = Number(item.position || index + 1);
  const rawTime = item.finish_time;
  const finishTime = rawTime !== null && rawTime !== undefined && rawTime !== "" && !Number.isNaN(Number(rawTime))
    ? `${Number(rawTime).toFixed(2)}s`
    : item.time || "TBA";

  return {
    id: getId(item) || `RES-${index + 1}`,
    date: formatRaceTime(race.race_date || item.created_at).split(", ")[0],
    race: getName(race, item.race_name || "Published race"),
    horse: getName(horse, item.horse_name || "Assigned horse"),
    position,
    time: finishTime,
    prize: item.prize || item.prize_amount || "-",
    status: normalizeStatus(item.status, "Published"),
  };
}

function mapPrizeAward(item, index = 0) {
  const result = item.race_result_id || item.race_result || {};
  const prize = item.prize_id || item.prize || {};
  const race = result.race_id || result.race || prize.race_id || prize.race || {};
  const horse = item.horse_id || result.horse_id || result.horse || {};
  const position = Number(result.final_position ?? result.position ?? item.position ?? index + 1);
  const finishTime = result.final_finish_time ?? result.finish_time ?? result.raw_finish_time;

  return {
    id: getId(item) || `AWARD-${index + 1}`,
    date: formatRaceTime(race.race_date || result.created_at || item.awarded_at || item.calculated_at).split(", ")[0],
    race: getName(race, `Race ${index + 1}`),
    horse: getName(horse, `Horse ${index + 1}`),
    position,
    time: finishTime !== null && finishTime !== undefined && finishTime !== "" && !Number.isNaN(Number(finishTime))
      ? `${Number(finishTime).toFixed(2)}s`
      : "TBA",
    prize: formatMoney(item.jockey_amount ?? 0, item.currency || prize.currency || "VND"),
    grossPrize: formatMoney(item.gross_amount ?? item.amount ?? 0, item.currency || prize.currency || "VND"),
    status: normalizeStatus(item.status, "Published"),
  };
}

function mapProfile(data, user, stats, approvalStatus) {
  const profile = data?.jockey || data?.profile || data?.jockey_profile || data || {};
  const account = data?.user || user || {};
  const winRate = Number(stats?.win_rate ?? 0);
  const totalRaces = Number(stats?.total_races ?? 0);
  const top3 = Number(stats?.top_3_finishes ?? 0);
  const podiumRate = totalRaces ? Math.round((top3 / totalRaces) * 100) : 0;
  const approved = approvalStatus?.approval_status || approvalStatus || {};
  const status = approved.is_approved || profile.status === "active" ? "Available" : normalizeStatus(profile.status, "Review");

  return {
    id: profile._id || approved.jockey_id || "Jockey profile",
    name: account.full_name || profile.full_name || "Jockey profile",
    email: account.email || "Email not recorded",
    phone: account.phone_number || "Phone not recorded",
    location: profile.location || profile.address || "Location not recorded",
    license: profile.license_number ? `License ${profile.license_number}` : "License not recorded",
    status,
    season: "Season 2026",
    stableConnection: profile.stable_name || "Stable not recorded",
    weightClass: (profile.weight_kg ?? profile.weight) ? `${profile.weight_kg ?? profile.weight} kg class` : "Weight class not recorded",
    availability: "Availability pending",
    height: profile.height || "",
    weight: profile.weight_kg ?? profile.weight ?? "",
    experienceYears: profile.experience_years || 0,
    licenseNumber: profile.license_number || "",
    apiStatus: profile.status || "active",
    winRate: totalRaces ? `${Math.round(winRate)}%` : "0%",
    podiumRate: totalRaces ? `${podiumRate}%` : "0%",
  };
}

function formatPenalty(penalty) {
  if (!penalty) return "No penalty recorded";
  if (typeof penalty === "string") return penalty;
  if (typeof penalty !== "object") return String(penalty);

  const details = [];
  if (penalty.type) details.push(String(penalty.type).replaceAll("_", " "));
  if (penalty.time_penalty_seconds) details.push(`+${penalty.time_penalty_seconds}s`);
  if (penalty.position_delta) details.push(`${penalty.position_delta} position`);
  if (penalty.score_deduction) details.push(`-${penalty.score_deduction} score`);
  if (penalty.suspension_days) details.push(`${penalty.suspension_days} day suspension`);
  if (penalty.fine_amount) details.push(`Fine ${penalty.fine_amount}`);
  if (penalty.disqualified) details.push("Disqualification");
  if (!details.length && penalty.note) details.push(penalty.note);

  return details.join(" · ") || "Penalty recorded";
}

function mapViolation(item, index = 0) {
  const race = (item.race && typeof item.race === "object") ? item.race : (item.race_id && typeof item.race_id === "object" ? item.race_id : {});
  const horse = (item.horse && typeof item.horse === "object") ? item.horse : (item.horse_id && typeof item.horse_id === "object" ? item.horse_id : {});
  const referee = (item.referee && typeof item.referee === "object") ? item.referee : (item.referee_id && typeof item.referee_id === "object" ? item.referee_id : {});
  const refereeUser = referee.user_id || referee.user || {};

  return {
    id: getId(item) || `VIO-${index + 1}`,
    type: item.violation_type || "Recorded violation",
    description: item.description || "No additional description.",
    penalty: formatPenalty(item.penalty || item.proposed_penalty || item.suggested_penalty),
    status: normalizeStatus(item.status, "Recorded"),
    race: getName(race, "Race pending"),
    horse: getName(horse, "Horse pending"),
    referee: getName(refereeUser, "Race referee"),
    date: formatRaceTime(item.created_at).split(", ")[0],
  };
}

export function adaptJockeyApiData({ me, assignments, schedule, results, prizeAwards, stats, violations, approvalStatus, user }) {
  const assignmentItems = asArray(assignments, "assignments").map(mapAssignment);
  const publishedRaceIds = new Set(
    asArray(results, "results")
      .filter((item) => String(item?.status || "").toLowerCase() === "published")
      .map((item) => getId(item.race_id || item.race))
      .filter(Boolean)
      .map(String)
  );
  const scheduleItems = asArray(schedule, "schedule").map((item, index) => {
    const mapped = item.race_id || item.horse_id ? mapAssignment(item, index) : mapAssignment({ ...item, status: item.status || "accepted" }, index);
    const raceId = getId(item.race_id || item.race);
    return {
      id: mapped.id,
      time: mapped.date,
      race: mapped.race,
      tournament: mapped.tournament,
      horse: mapped.horse,
      venue: mapped.venue,
      round: mapped.round,
      status: raceId && publishedRaceIds.has(String(raceId)) ? "Complete" : mapped.status,
    };
  });
  const resultItems = asArray(results, "results").map(mapResult);
  const rawPrizeAwards = asArray(prizeAwards, "awards");
  const prizeAwardItems = rawPrizeAwards.map(mapPrizeAward);
  const violationItems = asArray(violations, "violations").map(mapViolation);
  const normalizedStats = stats?.stats || stats || {};
  const prizeAwardTotal = rawPrizeAwards.reduce((total, award) => total + Number(award?.jockey_amount || 0), 0);
  const prizeAwardCurrency = rawPrizeAwards[0]?.currency || rawPrizeAwards[0]?.prize_id?.currency || "VND";
  const baseProfile = mapProfile(me, user, normalizedStats, approvalStatus);
  const profile = {
    ...baseProfile,
    earnings: prizeAwardItems.length ? formatMoney(prizeAwardTotal, prizeAwardCurrency) : formatMoney(0, prizeAwardCurrency),
  };
  const sourceResults = prizeAwardItems.length ? prizeAwardItems : resultItems;

  return {
    profile,
    assignments: assignmentItems,
    invitations: assignmentItems,
    schedule: scheduleItems,
    results: sourceResults,
    stats: normalizedStats,
    violations: violationItems,
    usedFallback: false,
  };
}
