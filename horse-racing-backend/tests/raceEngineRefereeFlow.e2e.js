require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const { connectDatabase } = require('../config/database');
const { signAuthToken } = require('../utils/jwt');
const { hashPassword } = require('../utils/password');
const {
  User,
  Role,
  UserRole,
  HorseOwner,
  Jockey,
  RaceReferee,
  Horse,
  Tournament,
  Round,
  Race,
  Registration,
  JockeyAssignment,
  HorseCheck,
  RefereeReport,
  RaceResult,
  RaceEngineRun,
  RaceRun,
  Violation
} = require('../models');

const prefix = 'e2e-referee-engine-' + Date.now();
const ids = {};
const results = [];
let server;
let baseUrl;

function addId(kind, id) {
  if (!ids[kind]) {
    ids[kind] = [];
  }

  if (id) {
    ids[kind].push(id);
  }
}

function record(name, passed, detail) {
  results.push({ name: name, passed: passed, detail: detail });
  console.log((passed ? 'PASS' : 'FAIL') + ' - ' + name + ' - ' + detail);
}

async function request(method, path, token, body) {
  const response = await fetch(baseUrl + path, {
    method: method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(function() {
    return null;
  });

  return {
    status: response.status,
    body: json
  };
}

async function ensureRole(roleName) {
  let role = await Role.findOne({ role_name: roleName });

  if (!role) {
    role = await Role.create({ role_name: roleName, description: prefix });
    addId('roles', role._id);
  }

  return role;
}

async function createUser(roleName, label) {
  const role = await ensureRole(roleName);
  const user = await User.create({
    full_name: prefix + ' ' + label,
    email: prefix + '-' + label + '@example.com',
    password: await hashPassword('Password123'),
    status: 'active',
    email_verified: true,
    email_verified_at: new Date()
  });
  const userRole = await UserRole.create({
    user_id: user._id,
    role_id: role._id
  });

  addId('users', user._id);
  addId('userRoles', userRole._id);

  return {
    user: user,
    token: signAuthToken({
      user_id: user._id.toString(),
      email: user.email,
      roles: [roleName]
    })
  };
}

async function cleanup() {
  await Violation.deleteMany({ _id: { $in: ids.violations || [] } });
  await RaceResult.deleteMany({ race_id: { $in: ids.races || [] } });
  await RaceEngineRun.deleteMany({ race_id: { $in: ids.races || [] } });
  await RaceRun.deleteMany({ race_id: { $in: ids.races || [] } });
  await RefereeReport.deleteMany({ _id: { $in: ids.reports || [] } });
  await HorseCheck.deleteMany({ _id: { $in: ids.checks || [] } });
  await JockeyAssignment.deleteMany({ _id: { $in: ids.assignments || [] } });
  await Registration.deleteMany({ _id: { $in: ids.registrations || [] } });
  await Race.deleteMany({ _id: { $in: ids.races || [] } });
  await Round.deleteMany({ _id: { $in: ids.rounds || [] } });
  await Tournament.deleteMany({ _id: { $in: ids.tournaments || [] } });
  await Horse.deleteMany({ _id: { $in: ids.horses || [] } });
  await RaceReferee.deleteMany({ _id: { $in: ids.referees || [] } });
  await Jockey.deleteMany({ _id: { $in: ids.jockeys || [] } });
  await HorseOwner.deleteMany({ _id: { $in: ids.owners || [] } });
  await UserRole.deleteMany({ _id: { $in: ids.userRoles || [] } });
  await User.deleteMany({ _id: { $in: ids.users || [] } });

  if ((ids.roles || []).length) {
    await Role.deleteMany({ _id: { $in: ids.roles } });
  }
}

async function seedFlowData() {
  const ownerAuth = await createUser('horse_owner', 'owner');
  const jockeyAuth = await createUser('jockey', 'jockey');
  const otherJockeyAuth = await createUser('jockey', 'other-jockey');
  const refereeAuth = await createUser('race_referee', 'referee');
  const otherRefereeAuth = await createUser('race_referee', 'other-referee');
  const adminAuth = await createUser('admin', 'admin');
  const spectatorAuth = await createUser('spectator', 'spectator');
  const owner = await HorseOwner.create({
    user_id: ownerAuth.user._id,
    stable_name: prefix + ' stable',
    license_number: prefix + '-OWNER',
    status: 'active'
  });
  const jockey = await Jockey.create({
    user_id: jockeyAuth.user._id,
    license_number: prefix + '-JOCKEY',
    status: 'active'
  });
  const otherJockey = await Jockey.create({
    user_id: otherJockeyAuth.user._id,
    license_number: prefix + '-OTHER-JOCKEY',
    status: 'active'
  });
  const referee = await RaceReferee.create({
    user_id: refereeAuth.user._id,
    license_number: prefix + '-REF',
    status: 'active'
  });
  const otherReferee = await RaceReferee.create({
    user_id: otherRefereeAuth.user._id,
    license_number: prefix + '-OTHER-REF',
    status: 'active'
  });
  const tournament = await Tournament.create({
    name: prefix + ' tournament',
    status: 'active',
    created_by: adminAuth.user._id,
    start_date: new Date(Date.now() - 2 * 86400000),
    end_date: new Date(Date.now() + 86400000)
  });
  const round = await Round.create({
    tournament_id: tournament._id,
    name: prefix + ' round',
    round_order: 1,
    status: 'active'
  });
  const race = await Race.create({
    tournament_id: tournament._id,
    round_id: round._id,
    referee_id: referee._id,
    name: prefix + ' race',
    race_date: new Date(Date.now() - 60 * 60 * 1000),
    status: 'scheduled'
  });
  const futureRace = await Race.create({
    tournament_id: tournament._id,
    round_id: round._id,
    referee_id: referee._id,
    name: prefix + ' future race',
    race_date: new Date(Date.now() + 86400000),
    status: 'scheduled'
  });
  const horse = await Horse.create({
    owner_id: owner._id,
    name: prefix + ' horse',
    registration_number: prefix + '-HORSE',
    status: 'active'
  });
  const registration = await Registration.create({
    tournament_id: tournament._id,
    race_id: race._id,
    horse_id: horse._id,
    owner_id: owner._id,
    status: 'approved'
  });
  const assignment = await JockeyAssignment.create({
    race_id: race._id,
    horse_id: horse._id,
    owner_id: owner._id,
    jockey_id: jockey._id,
    status: 'accepted'
  });
  const preCheck = await HorseCheck.create({
    race_id: race._id,
    horse_id: horse._id,
    jockey_id: jockey._id,
    referee_id: referee._id,
    phase: 'pre_race',
    status: 'passed',
    is_eligible: true,
    checked_at: new Date(Date.now() - 2 * 60 * 60 * 1000)
  });

  addId('owners', owner._id);
  addId('jockeys', jockey._id);
  addId('jockeys', otherJockey._id);
  addId('referees', referee._id);
  addId('referees', otherReferee._id);
  addId('tournaments', tournament._id);
  addId('rounds', round._id);
  addId('races', race._id);
  addId('races', futureRace._id);
  addId('horses', horse._id);
  addId('registrations', registration._id);
  addId('assignments', assignment._id);
  addId('checks', preCheck._id);

  return {
    ownerAuth: ownerAuth,
    jockeyAuth: jockeyAuth,
    otherJockeyAuth: otherJockeyAuth,
    refereeAuth: refereeAuth,
    otherRefereeAuth: otherRefereeAuth,
    adminAuth: adminAuth,
    spectatorAuth: spectatorAuth,
    race: race,
    futureRace: futureRace,
    horse: horse,
    jockey: jockey
  };
}

async function run() {
  try {
    await connectDatabase();
    server = http.createServer(app);
    await new Promise(function(resolve) {
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = 'http://127.0.0.1:' + server.address().port;

    const data = await seedFlowData();
    const raceId = data.race._id.toString();
    let response = await request('POST', '/api/race-results', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: data.horse._id.toString(),
      jockey_id: data.jockey._id.toString()
    });

    record('manual result creation is disabled', response.status === 404, 'status=' + response.status);

    response = await request('GET', '/api/race-results/races/' + raceId + '/participants', data.refereeAuth.token);
    record(
      'referee views participant eligibility',
      response.status === 200 &&
        response.body.data.participants.length === 1 &&
        response.body.data.participants[0].eligible === true,
      'status=' + response.status
    );

    response = await request('GET', '/api/race-results/races/' + raceId + '/readiness', data.refereeAuth.token);
    record(
      'initial readiness exposes blockers',
      response.status === 200 &&
        response.body.data.ready === false &&
        response.body.data.missing_report === true &&
        response.body.data.race_status === 'scheduled',
      'status=' + response.status
    );

    response = await request('POST', '/api/race-results/races/' + raceId + '/finalize', data.ownerAuth.token);
    record('wrong role cannot finalize', response.status === 403, 'status=' + response.status);

    response = await request('POST', '/api/races/' + raceId + '/start', data.refereeAuth.token);
    const provisionalOrder = response.body && response.body.data && response.body.data.engine &&
      response.body.data.engine.race_run && response.body.data.engine.race_run.finish_order || [];

    record(
      'assigned referee starts race and gets provisional engine order',
      response.status === 200 &&
        response.body.data.race.status === 'running' &&
        provisionalOrder.length === 1 &&
        provisionalOrder[0].position === 1,
      'status=' + response.status
    );

    response = await request('GET', '/users/spectator/races/' + raceId + '/live-state', data.spectatorAuth.token);
    record(
      'spectator views provisional race engine live-state',
      response.status === 200 &&
        response.body.data.engine.finish_order.length === 1 &&
        response.body.data.engine.finish_order[0].position === provisionalOrder[0].position,
      'status=' + response.status
    );

    response = await request('POST', '/api/race-results/races/' + raceId + '/finalize', data.refereeAuth.token);
    record('missing submitted report blocks finalize', response.status === 400, 'status=' + response.status);

    response = await request('POST', '/api/referee-reports', data.refereeAuth.token, {
      race_id: raceId,
      report_title: 'Official race report',
      report_content: 'Race completed.',
      race_condition: 'normal',
      weather: 'clear',
      track_condition: 'good',
      conclusion: 'Ready for result review.'
    });
    const reportId = response.body && response.body.data && response.body.data.referee_report && response.body.data.referee_report._id;

    addId('reports', reportId);
    record('referee creates report', response.status === 201 && Boolean(reportId), 'status=' + response.status);

    response = await request('POST', '/api/referee-reports/' + reportId + '/submit', data.refereeAuth.token);
    record('referee submits report', response.status === 200 && response.body.data.referee_report.status === 'submitted', 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/finalize', data.refereeAuth.token);
    record('missing post-race check blocks finalize', response.status === 400, 'status=' + response.status);

    response = await request('POST', '/api/horse-checks/post-race', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: data.horse._id.toString(),
      jockey_id: data.jockey._id.toString(),
      status: 'normal',
      checklist: {
        horse_finished_safely: true,
        post_race_lameness_check: true,
        post_race_injury_check: true,
        breathing_recovered: true
      },
      check_note: 'No post-race issue.'
    });
    const postCheckId = response.body && response.body.data && response.body.data.horse_check && response.body.data.horse_check._id;

    addId('checks', postCheckId);
    record('referee creates post-race check', response.status === 201 && Boolean(postCheckId), 'status=' + response.status);

    response = await request('GET', '/api/violations/options', data.refereeAuth.token);
    record(
      'violation options expose controlled enums',
      response.status === 200 &&
        response.body.data.violation_types.includes('interference') &&
        response.body.data.penalty_types.includes('time_penalty') &&
        response.body.data.penalty_policies.length === 33,
      'status=' + response.status
    );

    response = await request('POST', '/api/violations/penalty-preview', data.refereeAuth.token, {
      violation_type: 'lane_violation',
      severity: 'major'
    });
    record(
      'referee previews backend penalty policy',
      response.status === 200 &&
        response.body.data.policy.requires_review === false &&
        response.body.data.policy.suggested_penalty.time_penalty_seconds === 3,
      'status=' + response.status
    );

    response = await request('POST', '/api/violations', data.refereeAuth.token, {
      race_id: raceId,
      violation_type: 'free_text_violation',
      severity: 'major'
    });
    record('invalid violation enum is rejected', response.status === 400, 'status=' + response.status);

    response = await request('POST', '/api/violations', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: data.horse._id.toString(),
      jockey_id: data.jockey._id.toString(),
      violation_type: 'lane_violation',
      severity: 'major',
      penalty: {
        type: 'warning'
      }
    });
    record('frontend cannot inject penalty values', response.status === 400, 'status=' + response.status);

    response = await request('POST', '/api/horse-checks/during-race', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: data.horse._id.toString(),
      jockey_id: data.jockey._id.toString(),
      status: 'incident_recorded',
      event_type: 'lane_violation',
      severity: 'major',
      description: 'Horse crossed the assigned lane.',
      time_marker: '00:42',
      evidence_urls: ['https://example.com/evidence/race-camera-1.jpg'],
      requires_violation: true
    });
    const violationId = response.body && response.body.data && response.body.data.violation && response.body.data.violation._id;
    const duringCheckId = response.body && response.body.data && response.body.data.horse_check && response.body.data.horse_check._id;

    addId('violations', violationId);
    addId('checks', duringCheckId);
    record(
      'during-race check creates unresolved policy-backed violation',
      response.status === 201 &&
        Boolean(violationId) &&
        response.body.data.auto_confirmed === false &&
        response.body.data.violation.status === 'recorded' &&
        response.body.data.violation.suggested_penalty.time_penalty_seconds === 3 &&
        !response.body.data.violation.penalty,
      'status=' + response.status
    );

    response = await request('POST', '/api/violations/' + violationId + '/confirm', data.refereeAuth.token, {
      decision: 'Confirmed after video review.'
    });
    record(
      'referee accepts policy suggestion explicitly',
      response.status === 200 &&
        response.body.data.violation.status === 'confirmed' &&
        response.body.data.violation.penalty.time_penalty_seconds === 3,
      'status=' + response.status
    );

    response = await request('GET', '/api/violations/' + violationId, data.jockeyAuth.token);
    record('affected jockey views own violation detail', response.status === 200, 'status=' + response.status);

    response = await request('GET', '/api/violations/' + violationId, data.otherJockeyAuth.token);
    record('other jockey cannot view violation detail', response.status === 403, 'status=' + response.status);

    response = await request('POST', '/api/violations', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: data.horse._id.toString(),
      jockey_id: data.jockey._id.toString(),
      violation_type: 'illegal_whip_use',
      severity: 'major',
      description: 'Whip use exceeded the app policy threshold.'
    });
    const suspensionViolationId = response.body && response.body.data && response.body.data.violation && response.body.data.violation._id;

    addId('violations', suspensionViolationId);
    record(
      'policy suggests jockey suspension penalty',
      response.status === 201 &&
        response.body.data.violation.status === 'recorded' &&
        response.body.data.violation.suggested_penalty.suspension_days === 3,
      'status=' + response.status
    );

    response = await request('POST', '/api/violations/' + suspensionViolationId + '/confirm', data.refereeAuth.token, {
      decision: 'Whip violation confirmed after steward review.'
    });
    record(
      'referee confirms suggested suspension',
      response.status === 200 &&
        response.body.data.violation.status === 'confirmed' &&
        response.body.data.violation.penalty.suspension_days === 3,
      'status=' + response.status
    );

    response = await request('POST', '/api/violations', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: data.horse._id.toString(),
      jockey_id: data.jockey._id.toString(),
      violation_type: 'track_safety_issue',
      severity: 'minor',
      description: 'Possible loose track marker requires review.'
    });
    const dismissedViolationId = response.body && response.body.data && response.body.data.violation && response.body.data.violation._id;

    addId('violations', dismissedViolationId);
    record(
      'sensitive violation is forced into review',
      response.status === 201 &&
        Boolean(dismissedViolationId) &&
        response.body.data.auto_confirmed === false &&
        response.body.data.violation.status === 'under_review',
      'status=' + response.status
    );

    response = await request('GET', '/api/race-results/races/' + raceId + '/readiness', data.refereeAuth.token);
    record(
      'running race is not ready to finalize',
      response.status === 200 &&
        response.body.data.ready === false &&
        response.body.data.missing_report === false &&
        response.body.data.missing_post_check_horse_ids.length === 0,
      'status=' + response.status
    );

    response = await request('POST', '/api/races/' + raceId + '/complete', data.refereeAuth.token);
    record('assigned referee completes race', response.status === 200 && response.body.data.race.status === 'completed', 'status=' + response.status);

    response = await request('GET', '/api/race-results/races/' + raceId + '/readiness', data.refereeAuth.token);
    record(
      'unresolved violation blocks finalization',
      response.status === 200 &&
        response.body.data.ready === false &&
        response.body.data.unresolved_violation_ids.includes(dismissedViolationId) &&
        !response.body.data.unresolved_violation_ids.includes(violationId),
      'status=' + response.status
    );

    response = await request('POST', '/api/violations/' + dismissedViolationId + '/dismiss', data.refereeAuth.token, {
      decision: 'Track inspection confirmed the marker was secured.'
    });
    record('sensitive review cannot be decided by referee', response.status === 403, 'status=' + response.status);

    response = await request('POST', '/api/violations/' + dismissedViolationId + '/confirm', data.adminAuth.token, {
      decision: 'Admin confirmed a fine after reviewing the track incident.',
      penalty: {
        type: 'fine',
        fine_amount: 50,
        note: 'Demo disciplinary fine.'
      }
    });
    record(
      'admin confirms reviewed violation with fine',
      response.status === 200 &&
        response.body.data.violation.status === 'confirmed' &&
        response.body.data.violation.penalty.fine_amount === 50,
      'status=' + response.status
    );

    response = await request('GET', '/api/race-results/races/' + raceId + '/readiness', data.refereeAuth.token);
    record('resolved violation makes completed race ready', response.status === 200 && response.body.data.ready === true, 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/finalize', data.refereeAuth.token);
    record('referee cannot finalize before applying penalties', response.status === 409, 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/apply-penalties', data.refereeAuth.token);
    const draftResults = response.body && response.body.data && response.body.data.engine && response.body.data.engine.results || [];

    record(
      'applying penalties first creates the engine draft from provisional order',
      response.status === 200 &&
        draftResults.length === 1 &&
        draftResults[0].position === provisionalOrder[0].position,
      'status=' + response.status + ', results=' + draftResults.length
    );

    const savedDraft = await RaceResult.findOne({ race_id: data.race._id });
    const resultId = savedDraft && savedDraft._id.toString();

    response = await request('GET', '/api/race-results/' + resultId, data.otherRefereeAuth.token);
    record('unassigned referee cannot view result detail', response.status === 403, 'status=' + response.status);

    response = await request('GET', '/api/race-results/' + resultId, data.refereeAuth.token);
    record('assigned referee views result detail', response.status === 200, 'status=' + response.status);

    response = await request('PATCH', '/api/race-results/' + resultId, data.refereeAuth.token, {
      finish_time: 61.25,
      score: 100,
      note: 'Reviewed by assigned referee.'
    });
    record('assigned referee updates draft', response.status === 200 && response.body.data.result.finish_time === 61.25, 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/finalize', data.refereeAuth.token);
    record('editing raw results requires penalties to be reapplied', response.status === 409, 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/apply-penalties', data.refereeAuth.token);
    const penalizedResult = response.body && response.body.data && response.body.data.results && response.body.data.results[0];
    record(
      'confirmed penalty creates raw and final result values',
      response.status === 200 &&
        penalizedResult.raw_finish_time === 61.25 &&
        penalizedResult.final_finish_time === 64.25 &&
        penalizedResult.finish_time === 64.25 &&
        penalizedResult.applied_violation_ids.some(function(violation) {
          return (violation._id || violation).toString() === violationId;
        }),
      'status=' + response.status
    );

    response = await request('POST', '/api/race-results/races/' + raceId + '/apply-penalties', data.refereeAuth.token);
    record(
      'penalty application is idempotent',
      response.status === 200 && response.body.data.results[0].final_finish_time === 64.25,
      'status=' + response.status
    );

    response = await request('POST', '/api/race-results/races/' + raceId + '/finalize', data.refereeAuth.token);
    record(
      'referee finalizes only after penalties and sends the summary to Admin',
      response.status === 200 && response.body.data.results.every(function(result) {
        return Boolean(result.submitted_to_admin_at);
      }),
      'status=' + response.status
    );

    response = await request('POST', '/api/race-results/races/' + raceId + '/publish', data.adminAuth.token);
    record('admin cannot bulk publish draft directly', response.status === 400, 'status=' + response.status);

    response = await request('POST', '/api/race-results/' + resultId + '/confirm', data.adminAuth.token);
    record('individual result confirmation endpoint is removed', response.status === 404, 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/confirm', data.adminAuth.token);
    const confirmedResult = response.body && response.body.data && response.body.data.results && response.body.data.results[0];
    const confirmedById = confirmedResult && confirmedResult.confirmed_by &&
      (confirmedResult.confirmed_by._id || confirmedResult.confirmed_by).toString();
    const confirmedAt = confirmedResult && confirmedResult.confirmed_at;
    record(
      'admin bulk confirms draft results',
      response.status === 200 && response.body.data.results.every(function(result) {
        return result.status === 'confirmed';
      }),
      'status=' + response.status
    );

    const disciplinedJockey = await Jockey.findById(data.jockey._id);
    const suspensionViolation = await Violation.findById(suspensionViolationId);
    const fineViolation = await Violation.findById(dismissedViolationId);

    record(
      'bulk confirm enforces suspension and fine once',
      disciplinedJockey.suspended_until > new Date() &&
        disciplinedJockey.outstanding_fine_amount === 50 &&
        Boolean(suspensionViolation.discipline_applied_at) &&
        Boolean(fineViolation.discipline_applied_at),
      'fine=' + disciplinedJockey.outstanding_fine_amount
    );

    response = await request('POST', '/api/jockey-assignments', data.ownerAuth.token, {
      race_id: data.futureRace._id.toString(),
      horse_id: data.horse._id.toString(),
      jockey_id: data.jockey._id.toString(),
      invitation_message: 'Suspension guard test',
      meeting: {
        title: 'Future race meeting',
        meeting_url: 'https://meet.google.com/abc-defg-hij',
        meeting_time: new Date(Date.now() + 3600000).toISOString()
      }
    });
    record('suspended jockey cannot receive new assignment', response.status === 400, 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/publish', data.adminAuth.token);
    const publishedResult = response.body && response.body.data && response.body.data.results && response.body.data.results[0];
    const publishedConfirmedById = publishedResult && publishedResult.confirmed_by &&
      (publishedResult.confirmed_by._id || publishedResult.confirmed_by).toString();
    const publishedById = publishedResult && publishedResult.published_by &&
      (publishedResult.published_by._id || publishedResult.published_by).toString();
    record(
      'admin bulk publishes confirmed results',
      response.status === 200 && response.body.data.results.every(function(result) {
        return result.status === 'published';
      }) &&
        publishedConfirmedById === confirmedById &&
        publishedResult.confirmed_at === confirmedAt &&
        publishedById === data.adminAuth.user._id.toString(),
      'status=' + response.status
    );

    const jockeyAfterPublish = await Jockey.findById(data.jockey._id);
    record(
      'publishing does not apply disciplinary penalty twice',
      jockeyAfterPublish.outstanding_fine_amount === 50 &&
        jockeyAfterPublish.suspended_until.getTime() === disciplinedJockey.suspended_until.getTime(),
      'fine=' + jockeyAfterPublish.outstanding_fine_amount
    );

    response = await request('GET', '/users/spectator/races/' + raceId + '/results', data.spectatorAuth.token);
    record(
      'spectator views published result',
      response.status === 200 && response.body.data.results.length === 1 && response.body.data.results[0].status === 'published',
      'status=' + response.status
    );

    response = await request('POST', '/api/violations', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: data.horse._id.toString(),
      violation_type: 'lane_violation',
      severity: 'minor'
    });
    record('published result locks new violation decisions', response.status === 409, 'status=' + response.status);

    const failures = results.filter(function(result) {
      return !result.passed;
    });

    console.log('SUMMARY:', results.length - failures.length + '/' + results.length + ' passed');

    if (failures.length) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('E2E ERROR:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error('CLEANUP ERROR:', error.message);
      process.exitCode = 1;
    }

    if (server) {
      await new Promise(function(resolve) {
        server.close(resolve);
      });
    }

    await mongoose.disconnect();
  }
}

run();
