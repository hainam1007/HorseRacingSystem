const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const refereeReportRepository = require('../repositories/refereeReportRepository');

function hasRole(req, role) {
  return (req.roles || req.auth.roles || []).includes(role);
}

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function getDocumentId(value) {
  return value && (value._id || value);
}

async function getCurrentReferee(req) {
  const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

  if (!referee) {
    throw new ApiError(404, 'Race referee profile not found');
  }

  return referee;
}

async function resolveRefereeId(req, race, payload) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    const refereeId = payload.referee_id || getDocumentId(race.referee_id);

    if (!refereeId) {
      throw new ApiError(400, 'referee_id is required when the race has no assigned referee');
    }

    return refereeId;
  }

  const referee = await getCurrentReferee(req);
  const assignedRefereeId = getDocumentId(race.referee_id);

  if (assignedRefereeId && !sameId(assignedRefereeId, referee._id)) {
    throw new ApiError(403, 'You can only create reports for races assigned to you');
  }

  return referee._id;
}

async function ensureCanAccessReport(req, report) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    return;
  }

  const referee = await getCurrentReferee(req);

  if (sameId(getDocumentId(report.referee_id), referee._id)) {
    return;
  }

  throw new ApiError(403, 'You do not have permission to access this referee report');
}

async function createRefereeReport(req, payload) {
  const race = await raceRepository.findById(payload.race_id);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  const refereeId = await resolveRefereeId(req, race, payload);
  const report = await refereeReportRepository.create({
    race_id: race._id,
    referee_id: refereeId,
    report_title: payload.report_title,
    report_content: payload.report_content,
    race_condition: payload.race_condition,
    weather: payload.weather,
    track_condition: payload.track_condition,
    conclusion: payload.conclusion,
    status: 'draft',
    created_at: new Date()
  });

  return {
    referee_report: report
  };
}

async function listRefereeReports(req, query) {
  const filter = {};

  ['race_id', 'referee_id', 'status'].forEach(function(field) {
    if (query[field]) {
      filter[field] = query[field];
    }
  });

  if (hasRole(req, ROLE_NAMES.RACE_REFEREE) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const referee = await getCurrentReferee(req);

    filter.referee_id = referee._id;
  }

  return {
    referee_reports: await refereeReportRepository.find(filter)
  };
}

async function getRefereeReport(req, id) {
  const report = await refereeReportRepository.findById(id);

  if (!report) {
    throw new ApiError(404, 'Referee report not found');
  }

  await ensureCanAccessReport(req, report);

  return {
    referee_report: report
  };
}

async function updateRefereeReport(req, id, payload) {
  const report = await refereeReportRepository.findById(id);

  if (!report) {
    throw new ApiError(404, 'Referee report not found');
  }

  await ensureCanAccessReport(req, report);

  if (!hasRole(req, ROLE_NAMES.ADMIN) && report.status !== 'draft') {
    throw new ApiError(400, 'Only draft reports can be updated by the referee');
  }

  const updatedReport = await refereeReportRepository.updateById(id, payload);

  return {
    referee_report: updatedReport
  };
}

async function submitRefereeReport(req, id) {
  const report = await refereeReportRepository.findById(id);

  if (!report) {
    throw new ApiError(404, 'Referee report not found');
  }

  await ensureCanAccessReport(req, report);

  if (report.status === 'submitted') {
    throw new ApiError(409, 'Referee report is already submitted');
  }

  const updatedReport = await refereeReportRepository.updateById(id, {
    status: 'submitted',
    submitted_at: new Date()
  });

  return {
    referee_report: updatedReport
  };
}

module.exports = {
  createRefereeReport,
  getRefereeReport,
  listRefereeReports,
  submitRefereeReport,
  updateRefereeReport
};
