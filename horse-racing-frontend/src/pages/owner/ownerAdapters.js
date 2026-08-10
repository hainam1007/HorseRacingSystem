export function getDisplayStatus(status) {
  const normalized = (status || "").toLowerCase();

  if (normalized === "active") return "Ready";
  if (normalized === "inactive") return "Closed";
  if (normalized === "pending") return "Needs review";

  return status || "Needs review";
}

export function getApiStatus(status) {
  const normalized = (status || "").toLowerCase();

  if (normalized === "ready") return "active";
  if (normalized === "closed") return "inactive";
  if (normalized === "needs review") return "pending";

  return status || "active";
}

function getAgeFromBirthDate(dateOfBirth) {
  if (!dateOfBirth) return "Not set";

  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return "Not set";

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age > 0 ? age : "Not set";
}

function getDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function getNumberFromWeight(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function toOwnerHorse(apiHorse) {
  const displayStatus = getDisplayStatus(apiHorse.status);
  const weightValue = hasValue(apiHorse.weight) ? `${apiHorse.weight} kg` : "";
  const registrationNumber = apiHorse.registration_number || "";
  const dateOfBirth = getDateInputValue(apiHorse.date_of_birth);
  const age = getAgeFromBirthDate(apiHorse.date_of_birth);
  const healthNote = apiHorse.health_status || "";

  return {
    id: apiHorse._id || apiHorse.id,
    registrationNumber,
    name: apiHorse.name || "Unnamed horse",
    breed: apiHorse.breed || "",
    gender: apiHorse.gender || "",
    color: apiHorse.color || "",
    dateOfBirth,
    age,
    weight: weightValue,
    status: displayStatus,
    healthNote,
    currentRating: Number(apiHorse.current_rating ?? 50),
    imageUrl: apiHorse.image_url,
    facts: [
      apiHorse.breed ? { label: "Breed", value: apiHorse.breed } : null,
      apiHorse.gender ? { label: "Gender", value: apiHorse.gender } : null,
      apiHorse.color ? { label: "Color", value: apiHorse.color } : null,
      age !== "Not set" ? { label: "Age", value: `${age} yrs` } : null,
      weightValue ? { label: "Weight", value: weightValue } : null,
      { label: "Rating", value: String(apiHorse.current_rating ?? 50) },
    ].filter(Boolean),
    raw: apiHorse,
  };
}

export function toOwnerProfile(apiProfile, user) {
  return {
    name: user?.full_name || user?.email || "Horse Owner",
    stable: apiProfile?.stable_name || "Stable not set",
    email: user?.email || "No email",
    phone: user?.phone_number || "No phone",
    avatarUrl: apiProfile?.avatar_url || user?.avatar_url || "",
    location: apiProfile?.address || "No address",
    status: getDisplayStatus(apiProfile?.status || "active"),
    licenseNumber: apiProfile?.license_number || "No license",
    raw: apiProfile,
  };
}

export function toOwnerProfilePayload(form) {
  return {
    stable_name: form.stable,
    address: form.location,
    license_number: form.licenseNumber,
    status: getApiStatus(form.status),
  };
}

export function toHorsePayload(form) {
  const payload = {
    name: form.name,
    breed: form.breed,
    health_status: form.healthNote,
    registration_number: form.registrationNumber,
    status: getApiStatus(form.status),
  };

  const weight = getNumberFromWeight(form.weight);
  if (weight !== undefined) {
    payload.weight = weight;
  }

  if (form.dateOfBirth) {
    payload.date_of_birth = form.dateOfBirth;
  }

  return payload;
}

function getName(value, fallback = "Unknown") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  return value.full_name || value.name || value.email || fallback;
}

function getEntityId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function titleCaseStatus(value, fallback = "Unknown") {
  if (!value) return fallback;
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getDisplayDate(value, fallback = "Date unavailable") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function getTimeLabel(value) {
  if (value === undefined || value === null || value === "") return "-";
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return `${numericValue.toFixed(2)}s`;
}

export function toOwnerJockey(apiJockey, index = 0) {
  const user = apiJockey.user_id || apiJockey.user || {};
  const races = apiJockey.total_races || apiJockey.races || 0;
  const wins = apiJockey.total_wins || apiJockey.wins || 0;
  const availableForRace = apiJockey.available_for_race ?? apiJockey.availableForRace;
  const availabilityReason = apiJockey.availability_reason || apiJockey.availabilityReason || "";

  return {
    id: apiJockey._id || apiJockey.id || `J-${index + 1}`,
    name: getName(user, apiJockey.name || `Jockey ${index + 1}`),
    assignedHorse: "Unassigned",
    races,
    wins,
    availability: apiJockey.status === "active" ? "Available" : getDisplayStatus(apiJockey.status),
    status: apiJockey.status === "active" ? "Available" : getDisplayStatus(apiJockey.status),
    licenseNumber: apiJockey.license_number || "No license",
    availableForRace: availableForRace === undefined || availableForRace === null
      ? null
      : Boolean(availableForRace),
    availabilityReason,
    raw: apiJockey,
  };
}

export function toOwnerTournament(apiTournament, index = 0) {
  const startDate = getDisplayDate(apiTournament.start_date, "");
  const endDate = getDisplayDate(apiTournament.end_date, "");

  return {
    id: apiTournament._id || apiTournament.id || `T-${index + 1}`,
    name: apiTournament.name || `Tournament ${index + 1}`,
    description: apiTournament.description || "",
    location: apiTournament.location || "",
    status: getDisplayStatus(apiTournament.status || "active"),
    date: startDate && endDate ? `${startDate} to ${endDate}` : startDate || endDate || "",
    prizePool: Number(apiTournament.total_race_prize_pool || 0),
    prizeCurrency: Object.keys(apiTournament.prize_totals_by_currency || {})[0] || "VND",
    prizeTotalsByCurrency: apiTournament.prize_totals_by_currency || {},
    raceCount: Number(apiTournament.race_count || 0),
    expectedParticipants: Number(apiTournament.expected_participants || 0),
    raw: apiTournament,
  };
}

export function toOwnerRaceOption(apiRace, index = 0) {
  const round = apiRace.round_id || apiRace.round || {};
  const raceDate = apiRace.race_date ? new Date(apiRace.race_date) : null;
  const hasRaceDate = raceDate && !Number.isNaN(raceDate.getTime());
  const lockDate = apiRace.registration_lock_at ? new Date(apiRace.registration_lock_at) : null;
  const hasLockDate = lockDate && !Number.isNaN(lockDate.getTime());

  const prizePool = Number(apiRace.prize_pool || 0);
  const maxParticipants = Number(apiRace.max_participants || 0);
  const participantCount = Number(apiRace.participant_count || 0);
  const remainingSlots = apiRace.remaining_slots === null || (apiRace.remaining_slots === undefined && maxParticipants <= 0)
    ? null
    : Number(apiRace.remaining_slots ?? Math.max(0, maxParticipants - participantCount));
  const entryFeeVnd = Number(apiRace.entry_fee ?? apiRace.entry_fee_vnd ?? 0);
  const registrationAvailable = apiRace.registration_available !== undefined
    ? Boolean(apiRace.registration_available)
    : String(apiRace.status || 'scheduled').toLowerCase() === 'scheduled'
      && !apiRace.registration_locked
      && (!hasLockDate || lockDate.getTime() > Date.now())
      && (maxParticipants <= 0 || remainingSlots > 0);

  return {
    id: apiRace._id || apiRace.id || `R-${index + 1}`,
    name: apiRace.name || `Race ${index + 1}`,
    round: getName(round, ""),
    roundOrder: round.round_order || "",
    status: getDisplayStatus(apiRace.status || "scheduled"),
    date: hasRaceDate ? raceDate.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "",
    clock: hasRaceDate ? raceDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "",
    location: apiRace.location || "",
    distance: hasValue(apiRace.distance) ? `${apiRace.distance}m` : "",
    course: apiRace.course || "",
    raceClass: apiRace.race_class || "",
    going: apiRace.going || "",
    surface: apiRace.surface || "",
    maxParticipants: hasValue(apiRace.max_participants) ? String(apiRace.max_participants) : "",
    participantCount,
    remainingSlots,
    registrationAvailable,
    registrationUnavailableReason: apiRace.registration_unavailable_reason || "",
    prizePool,
    prizeCurrency: apiRace.prize_currency || "VND",
    entryFeeVnd,
    entryFeeCurrency: apiRace.entry_fee_currency || "VND",
    registrationLock: hasLockDate
      ? `${lockDate.toLocaleDateString("en-US", { month: "short", day: "2-digit" })}, ${lockDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
      : "",
    raw: apiRace,
  };
}

export function toHorseApprovalStatus(data) {
  return {
    readyToRace: Boolean(data?.ready_to_race),
    registrations: (data?.registrations || []).map(toOwnerRegistration),
    checks: data?.checks || [],
  };
}

function getRegistrationStatus(status) {
  const normalized = (status || "").toLowerCase();

  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";

  return "Pending";
}

export function toOwnerRegistration(apiRegistration, index = 0) {
  const horse = apiRegistration.horse_id || apiRegistration.horse || {};
  const race = apiRegistration.race_id || apiRegistration.race || {};
  const tournament = apiRegistration.tournament_id || apiRegistration.tournament || race.tournament_id || {};
  const registeredAt = apiRegistration.registered_at || apiRegistration.created_at || apiRegistration.updated_at;
  const date = registeredAt && !Number.isNaN(new Date(registeredAt).getTime())
    ? new Date(registeredAt).toISOString().slice(0, 10)
    : "Pending date";

  return {
    id: apiRegistration._id || apiRegistration.id || `REG-${index + 1}`,
    horseId: horse._id || horse.id || apiRegistration.horse_id,
    raceId: race._id || race.id || apiRegistration.race_id,
    tournamentId: tournament._id || tournament.id || apiRegistration.tournament_id,
    horse: horse.name || `Horse ${index + 1}`,
    race: race.name || "Race pending",
    tournament: tournament.name || "Tournament pending",
    submitted: date,
    note: apiRegistration.note || apiRegistration.admin_note || "No note recorded.",
    status: getRegistrationStatus(apiRegistration.status),
    entryFeeVnd: Number(apiRegistration.entry_fee_vnd || 0),
    entryFeeToken: Number(apiRegistration.entry_fee_token || 0),
    paymentStatus: titleCaseStatus(apiRegistration.payment_status || "not_required", "Not Required"),
    paymentPaidAt: apiRegistration.payment_paid_at || null,
    paymentRefundedAt: apiRegistration.payment_refunded_at || null,
    raceDate: race.race_date || null,
    venue: race.location || "Venue unavailable",
    round: getName(race.round_id || race.round, "Round unavailable"),
    raceStatus: getDisplayStatus(race.status || "scheduled"),
    raw: apiRegistration,
  };
}

const CLOSED_CANCELLATION_RACE_STATUSES = new Set([
  "starting",
  "started",
  "running",
  "ongoing",
  "in_progress",
  "completed",
  "finished",
  "cancelled",
  "canceled",
  "deleted",
]);

export function canRequestRegistrationCancellation(registration, now = Date.now()) {
  if (!registration || registration.status !== "Approved") return false;

  const raceDate = registration.raceDate ? new Date(registration.raceDate) : null;
  if (!raceDate || Number.isNaN(raceDate.getTime()) || raceDate.getTime() <= now) return false;

  const raceStatus = String(
    registration.raw?.race_id?.status
      || registration.raw?.race?.status
      || registration.raceStatus
      || "",
  ).trim().toLowerCase().replaceAll(" ", "_");

  return !CLOSED_CANCELLATION_RACE_STATUSES.has(raceStatus);
}

function nestedId(value) {
  return String(value?._id || value?.id || value || "");
}

function assignmentJockeyName(assignment) {
  const jockey = assignment?.jockey_id || assignment?.jockey;
  if (!jockey || typeof jockey === "string") return "Assignment unavailable";

  return jockey.name
    || jockey.full_name
    || jockey.user_id?.full_name
    || jockey.user_id?.email
    || "Assignment unavailable";
}

export function findAcceptedPrimaryAssignment(assignments, registration) {
  return (assignments || []).find((assignment) => {
    const type = assignment.assignment_type || "primary";
    return type === "primary"
      && assignment.status === "accepted"
      && nestedId(assignment.race_id || assignment.race) === nestedId(registration.raceId)
      && nestedId(assignment.horse_id || assignment.horse) === nestedId(registration.horseId);
  });
}

export function toOwnerScheduleEntry(registration, assignment = null) {
  const raceDate = registration.raceDate ? new Date(registration.raceDate) : null;
  const hasRaceDate = raceDate && !Number.isNaN(raceDate.getTime());
  const status = registration.status === "Approved"
    ? "Confirmed"
    : registration.status === "Pending"
      ? "Pending"
      : "Closed";

  return {
    id: registration.id,
    raceId: registration.raceId,
    horseId: registration.horseId,
    race: registration.race,
    tournament: registration.tournament,
    horse: registration.horse,
    jockey: assignmentJockeyName(assignment),
    venue: registration.venue,
    round: registration.round,
    status,
    raceStatus: registration.raceStatus,
    date: hasRaceDate
      ? raceDate.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
      : "Date unavailable",
    clock: hasRaceDate
      ? raceDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : "Time unavailable",
    time: hasRaceDate
      ? `${raceDate.toLocaleDateString("en-US", { month: "short", day: "2-digit" })}, ${raceDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
      : "Date unavailable",
  };
}

export function toOwnerPrizeAward(apiAward, index = 0) {
  const result = apiAward?.race_result_id || apiAward?.race_result || {};
  const prize = apiAward?.prize_id || apiAward?.prize || {};
  const race = result.race_id || result.race || prize.race_id || prize.race || {};
  const tournament = race.tournament_id || race.tournament || prize.tournament_id || prize.tournament || {};
  const round = race.round_id || race.round || {};
  const horse = apiAward?.horse_id || result.horse_id || result.horse || {};
  const jockey = apiAward?.jockey_id || result.jockey_id || result.jockey || {};
  const violations = Array.isArray(result.applied_violation_ids) ? result.applied_violation_ids : [];
  const finalPosition = result.final_position ?? result.position ?? apiAward?.position ?? null;
  const rawPosition = result.raw_position ?? result.position ?? apiAward?.position ?? null;
  const isDisqualified = finalPosition === null || finalPosition === undefined || result.disqualified === true;
  const penaltySummary = isDisqualified
    ? "Disqualified"
    : violations.length > 0
      ? violations
        .slice(0, 2)
        .map((violation) => `${titleCaseStatus(violation.violation_type || violation.type, "Penalty")} (${titleCaseStatus(violation.severity, "Severity")})`)
        .join(", ")
      : "No penalty";

  return {
    id: apiAward?._id || apiAward?.id || `AWARD-${index + 1}`,
    raceId: getEntityId(race),
    raceName: race.name || `Race ${index + 1}`,
    tournamentName: tournament.name || "Tournament unavailable",
    roundName: getName(round, "Round unavailable"),
    horseName: horse.name || `Horse ${index + 1}`,
    jockeyName: getName(jockey.user_id || jockey.user || jockey, "Jockey unavailable"),
    awardStatus: titleCaseStatus(apiAward?.status || "calculated"),
    resultStatus: titleCaseStatus(result.status || "published"),
    date: getDisplayDate(race.race_date || result.created_at || apiAward?.awarded_at || apiAward?.calculated_at),
    calculatedAt: getDisplayDate(apiAward?.calculated_at || apiAward?.created_at),
    awardedAt: getDisplayDate(apiAward?.awarded_at || apiAward?.approved_at || apiAward?.paid_at || apiAward?.calculated_at),
    paidAt: apiAward?.paid_at ? getDisplayDate(apiAward.paid_at) : "Not paid yet",
    position: finalPosition,
    rawPosition,
    finalPositionLabel: isDisqualified ? "DQ" : `#${finalPosition}`,
    rawPositionLabel: rawPosition ? `#${rawPosition}` : "-",
    rawTime: getTimeLabel(result.raw_finish_time ?? result.finish_time),
    finalTime: getTimeLabel(result.final_finish_time ?? result.finish_time),
    currency: apiAward?.currency || prize.currency || "VND",
    grossAmount: Number(apiAward?.gross_amount ?? apiAward?.amount ?? 0),
    ownerAmount: Number(apiAward?.owner_amount ?? apiAward?.amount ?? 0),
    jockeyAmount: Number(apiAward?.jockey_amount ?? 0),
    penaltyCount: violations.length,
    penaltySummary,
    isDisqualified,
    violations: violations.map((violation) => ({
      id: violation._id || violation.id,
      type: titleCaseStatus(violation.violation_type || violation.type, "Penalty"),
      severity: titleCaseStatus(violation.severity, "Severity"),
      status: titleCaseStatus(violation.status, "Confirmed"),
      description: violation.description || violation.note || "No detail",
      penaltyType: titleCaseStatus(violation.penalty?.type, "Penalty"),
      penaltyValue: violation.penalty?.value ?? null,
    })),
    raw: apiAward,
  };
}
