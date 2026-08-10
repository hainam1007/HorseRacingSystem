require('dotenv').config();

process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.RACE_ENGINE_RANDOM_SEED = process.env.RACE_ENGINE_RANDOM_SEED || 'backup-jockey-e2e';

const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const { connectDatabase } = require('../config/database');
const { signAuthToken } = require('../utils/jwt');
const { hashPassword } = require('../utils/password');
const {
  Horse,
  HorseCheck,
  HorseOwner,
  Jockey,
  JockeyAssignment,
  Race,
  RaceEngineRun,
  RaceReferee,
  RaceResult,
  RaceRun,
  RefereeReport,
  Registration,
  Role,
  Round,
  Tournament,
  User,
  UserRole,
  Violation,
  PrizeAward,
  Prize
} = require('../models');

const prefix = 'e2e-backup-jockey-' + Date.now();
const ids = {};
const results = [];
let server;
let baseUrl;

function documentId(value) {
  return value && (value._id || value.id || value).toString();
}

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
  await PrizeAward.deleteMany({ race_id: { $in: ids.races || [] } });
  await Prize.deleteMany({ race_id: { $in: ids.races || [] } });
  await Violation.deleteMany({ race_id: { $in: ids.races || [] } });
  await RaceResult.deleteMany({ race_id: { $in: ids.races || [] } });
  await RaceEngineRun.deleteMany({ race_id: { $in: ids.races || [] } });
  await RaceRun.deleteMany({ race_id: { $in: ids.races || [] } });
  await RefereeReport.deleteMany({ race_id: { $in: ids.races || [] } });
  await HorseCheck.deleteMany({ race_id: { $in: ids.races || [] } });
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

function futureMeeting(minutes) {
  return {
    title: 'Backup jockey e2e appointment',
    meeting_time: new Date(Date.now() + minutes * 60000).toISOString(),
    location_name: 'Saigon Racing Club Office',
    address: '123 Nguyen Hue Street',
    city: 'Ho Chi Minh City',
    contact_name: 'E2E Coordinator',
    contact_phone: '+84901234567',
    note: 'E2E offline appointment'
  };
}

async function seedFlowData() {
  const ownerAuth = await createUser('horse_owner', 'owner');
  const primaryJockeyAuth = await createUser('jockey', 'primary-jockey');
  const backupJockeyAuth = await createUser('jockey', 'backup-jockey');
  const otherJockeyAuth = await createUser('jockey', 'other-jockey');
  const refereeAuth = await createUser('race_referee', 'referee');
  const adminAuth = await createUser('admin', 'admin');
  const spectatorAuth = await createUser('spectator', 'spectator');
  const owner = await HorseOwner.create({
    user_id: ownerAuth.user._id,
    stable_name: prefix + ' stable',
    license_number: prefix + '-OWNER',
    status: 'active'
  });
  const primaryJockey = await Jockey.create({
    user_id: primaryJockeyAuth.user._id,
    license_number: prefix + '-PRIMARY',
    status: 'active'
  });
  const backupJockey = await Jockey.create({
    user_id: backupJockeyAuth.user._id,
    license_number: prefix + '-BACKUP',
    status: 'active'
  });
  const otherJockey = await Jockey.create({
    user_id: otherJockeyAuth.user._id,
    license_number: prefix + '-OTHER',
    status: 'active'
  });
  const referee = await RaceReferee.create({
    user_id: refereeAuth.user._id,
    license_number: prefix + '-REF',
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
    race_date: new Date(Date.now() - 60 * 60000),
    status: 'scheduled',
    location: 'Saigon Racecourse'
  });
  const horse = await Horse.create({
    owner_id: owner._id,
    name: prefix + ' Silver Comet',
    registration_number: prefix + '-HORSE-1',
    status: 'active'
  });
  const noPrimaryHorse = await Horse.create({
    owner_id: owner._id,
    name: prefix + ' Northern Signal',
    registration_number: prefix + '-HORSE-2',
    status: 'active'
  });
  const registration = await Registration.create({
    tournament_id: tournament._id,
    race_id: race._id,
    horse_id: horse._id,
    owner_id: owner._id,
    horse_no: 1,
    draw: 1,
    status: 'approved',
    approved_by: adminAuth.user._id,
    approved_at: new Date()
  });
  const noPrimaryRegistration = await Registration.create({
    tournament_id: tournament._id,
    race_id: race._id,
    horse_id: noPrimaryHorse._id,
    owner_id: owner._id,
    horse_no: 2,
    draw: 2,
    status: 'approved',
    approved_by: adminAuth.user._id,
    approved_at: new Date()
  });

  addId('owners', owner._id);
  addId('jockeys', primaryJockey._id);
  addId('jockeys', backupJockey._id);
  addId('jockeys', otherJockey._id);
  addId('referees', referee._id);
  addId('tournaments', tournament._id);
  addId('rounds', round._id);
  addId('races', race._id);
  addId('horses', horse._id);
  addId('horses', noPrimaryHorse._id);
  addId('registrations', registration._id);
  addId('registrations', noPrimaryRegistration._id);

  return {
    ownerAuth: ownerAuth,
    primaryJockeyAuth: primaryJockeyAuth,
    backupJockeyAuth: backupJockeyAuth,
    otherJockeyAuth: otherJockeyAuth,
    refereeAuth: refereeAuth,
    adminAuth: adminAuth,
    spectatorAuth: spectatorAuth,
    owner: owner,
    primaryJockey: primaryJockey,
    backupJockey: backupJockey,
    otherJockey: otherJockey,
    referee: referee,
    race: race,
    horse: horse,
    noPrimaryHorse: noPrimaryHorse
  };
}

async function completePrimaryAssignmentFlow(assignmentId, jockeyToken, ownerToken, label) {
  let response = await request('POST', '/api/jockey-assignments/' + assignmentId + '/accept-appointment', jockeyToken, {
    response_message: label + ' appointment accepted'
  });
  record(label + ' accepts appointment', response.status === 200 && response.body.data.assignment.status === 'meeting_accepted', 'status=' + response.status);

  response = await request('PATCH', '/api/jockey-assignments/' + assignmentId + '/terms', ownerToken, {
    agreed_terms: label + ' agreed terms for e2e backup jockey flow.',
    meeting_note: label + ' meeting completed.',
    agreed_at: new Date().toISOString()
  });
  record(label + ' terms are sent', response.status === 200 && response.body.data.assignment.status === 'terms_pending_confirmation', 'status=' + response.status);

  response = await request('POST', '/api/jockey-assignments/' + assignmentId + '/contract', ownerToken, {
    file_url: 'https://example.com/contracts/' + prefix + '-' + label + '-before-terms-confirmation.pdf',
    file_type: 'application/pdf',
    file_name: label + '-before-terms-confirmation.pdf'
  });
  record(label + ' contract is blocked until terms are confirmed', response.status === 400, 'status=' + response.status);

  response = await request('POST', '/api/jockey-assignments/' + assignmentId + '/confirm-terms', jockeyToken, {
    response_message: label + ' terms confirmed'
  });
  record(label + ' confirms terms', response.status === 200 && response.body.data.assignment.status === 'terms_agreed', 'status=' + response.status);

  response = await request('POST', '/api/jockey-assignments/' + assignmentId + '/contract', ownerToken, {
    file_url: 'https://example.com/contracts/' + prefix + '-' + label + '.pdf',
    file_type: 'application/pdf',
    file_name: label + '-agreement.pdf'
  });
  record(label + ' contract is uploaded', response.status === 200 && response.body.data.assignment.status === 'contract_uploaded', 'status=' + response.status);

  response = await request('POST', '/api/jockey-assignments/' + assignmentId + '/confirm-contract', jockeyToken, {
    response_message: label + ' contract confirmed'
  });
  record(label + ' confirms contract', response.status === 200 && response.body.data.assignment.status === 'accepted', 'status=' + response.status);

  return response;
}

async function completeStandbyFlow(assignmentId, jockeyToken, ownerToken, label) {
  let response = await request('POST', '/api/jockey-assignments/' + assignmentId + '/accept-appointment', jockeyToken, {
    response_message: label + ' appointment accepted'
  });
  record(label + ' accepts appointment', response.status === 200 && response.body.data.assignment.status === 'meeting_accepted', 'status=' + response.status);

  response = await request('PATCH', '/api/jockey-assignments/' + assignmentId + '/terms', ownerToken, {
    agreed_terms: label + ' standby availability, notice, and fee terms.',
    meeting_note: label + ' standby meeting completed.',
    agreed_at: new Date().toISOString()
  });
  record(
    label + ' standby terms are sent',
    response.status === 200 && response.body.data.assignment.status === 'standby_terms_pending_confirmation',
    'status=' + response.status
  );

  response = await request('POST', '/api/jockey-assignments/' + assignmentId + '/contract', ownerToken, {
    file_url: 'https://example.com/contracts/' + prefix + '-' + label + '.pdf',
    file_type: 'application/pdf',
    file_name: label + '-agreement.pdf'
  });
  record(label + ' backup contract upload is rejected', response.status === 400, 'status=' + response.status);

  response = await request('POST', '/api/jockey-assignments/' + assignmentId + '/confirm-terms', jockeyToken, {
    response_message: label + ' standby terms confirmed'
  });
  record(
    label + ' confirms standby terms without a contract',
    response.status === 200 && response.body.data.assignment.status === 'standby_confirmed',
    'status=' + response.status
  );

  return response;
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
    const horseId = data.horse._id.toString();

    let response = await request('POST', '/api/jockey-assignments', data.ownerAuth.token, {
      race_id: raceId,
      horse_id: data.noPrimaryHorse._id.toString(),
      jockey_id: data.backupJockey._id.toString(),
      assignment_type: 'backup',
      invitation_message: 'Backup should fail without primary.',
      meeting: futureMeeting(60)
    });
    record('backup without primary is rejected', response.status === 400, 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments', data.ownerAuth.token, {
      race_id: raceId,
      horse_id: horseId,
      jockey_id: data.primaryJockey._id.toString(),
      assignment_type: 'primary',
      invitation_message: 'Please ride Silver Comet as primary jockey.',
      meeting: futureMeeting(70)
    });
    const primaryAssignmentId = response.body && response.body.data && response.body.data.assignment && response.body.data.assignment._id;
    addId('assignments', primaryAssignmentId);
    record(
      'owner creates primary jockey invitation',
      response.status === 201 &&
        response.body.data.assignment.assignment_type === 'primary' &&
        response.body.data.assignment.status === 'meeting_invited',
      'status=' + response.status
    );

    response = await request('POST', '/api/jockey-assignments', data.ownerAuth.token, {
      race_id: raceId,
      horse_id: horseId,
      jockey_id: data.otherJockey._id.toString(),
      assignment_type: 'primary',
      invitation_message: 'Duplicate primary should fail.',
      meeting: futureMeeting(80)
    });
    record('second active primary is rejected', response.status === 409, 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments', data.ownerAuth.token, {
      race_id: raceId,
      horse_id: horseId,
      jockey_id: data.primaryJockey._id.toString(),
      assignment_type: 'backup',
      invitation_message: 'Same jockey should not be backup.',
      meeting: futureMeeting(90)
    });
    record('same jockey cannot be active primary and backup', response.status === 409, 'status=' + response.status);

    await completePrimaryAssignmentFlow(primaryAssignmentId, data.primaryJockeyAuth.token, data.ownerAuth.token, 'primary');

    response = await request('POST', '/api/jockey-assignments', data.ownerAuth.token, {
      race_id: raceId,
      horse_id: data.noPrimaryHorse._id.toString(),
      jockey_id: data.otherJockey._id.toString(),
      assignment_type: 'primary',
      invitation_message: 'Temporary negotiation used to verify unilateral withdrawal.',
      meeting: futureMeeting(95)
    });
    const withdrawnAssignmentId = response.body && response.body.data && response.body.data.assignment && response.body.data.assignment._id;
    addId('assignments', withdrawnAssignmentId);
    record('owner creates an invitation for withdrawal testing', response.status === 201 && Boolean(withdrawnAssignmentId), 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + withdrawnAssignmentId + '/accept-appointment', data.otherJockeyAuth.token, {
      response_message: 'Appointment accepted before negotiation withdrawal.'
    });
    record('temporary jockey accepts appointment', response.status === 200 && response.body.data.assignment.status === 'meeting_accepted', 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + withdrawnAssignmentId + '/withdraw', data.ownerAuth.token, {
      reason: 'The parties did not reach final primary riding terms.'
    });
    record(
      'owner can withdraw before a primary contract becomes active',
      response.status === 200 &&
        response.body.data.assignment.status === 'cancelled' &&
        response.body.data.assignment.withdrawal.initiated_by_party === 'horse_owner',
      'status=' + response.status
    );

    response = await request('POST', '/api/jockey-assignments', data.ownerAuth.token, {
      race_id: raceId,
      horse_id: horseId,
      jockey_id: data.backupJockey._id.toString(),
      assignment_type: 'backup',
      backup_priority: 1,
      invitation_message: 'Please stand by as backup jockey for Silver Comet.',
      meeting: futureMeeting(100)
    });
    const backupAssignmentId = response.body && response.body.data && response.body.data.assignment && response.body.data.assignment._id;
    addId('assignments', backupAssignmentId);
    record(
      'owner creates backup jockey invitation',
      response.status === 201 &&
        response.body.data.assignment.assignment_type === 'backup' &&
        response.body.data.assignment.backup_priority === 1,
      'status=' + response.status
    );

    response = await request('POST', '/api/jockey-assignments/' + backupAssignmentId + '/promote', data.ownerAuth.token, {
      reason: 'Early promote should fail because backup has not accepted yet.'
    });
    record('unaccepted backup cannot be promoted', response.status === 400, 'status=' + response.status);

    await completeStandbyFlow(backupAssignmentId, data.backupJockeyAuth.token, data.ownerAuth.token, 'backup');

    response = await request('GET', '/api/jockeys/me/schedule', data.backupJockeyAuth.token);
    record('backup does not appear in jockey schedule before promotion', response.status === 200 && response.body.data.schedule.length === 0, 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + backupAssignmentId + '/cancellation-request', data.backupJockeyAuth.token, {
      reason: 'Backup jockey asks to leave the standby contract.'
    });
    record(
      'backup jockey can request mutual cancellation',
      response.status === 201 &&
        response.body.data.assignment.status === 'standby_confirmed' &&
        response.body.data.assignment.cancellation_request.status === 'pending',
      'status=' + response.status
    );

    response = await request('POST', '/api/jockey-assignments', data.ownerAuth.token, {
      race_id: raceId,
      horse_id: horseId,
      jockey_id: data.otherJockey._id.toString(),
      assignment_type: 'backup',
      backup_priority: 1,
      invitation_message: 'A second active backup must be rejected.',
      meeting: futureMeeting(105)
    });
    record('second active backup is rejected', response.status === 409, 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + backupAssignmentId + '/cancellation-request/respond', data.ownerAuth.token, {
      decision: 'reject',
      response_message: 'Owner needs the standby contract to remain active.'
    });
    record(
      'owner rejects backup cancellation and standby agreement stays confirmed',
      response.status === 200 &&
        response.body.data.assignment.status === 'standby_confirmed' &&
        response.body.data.assignment.cancellation_request.status === 'rejected',
      'status=' + response.status
    );

    response = await request('POST', '/api/jockey-assignments/' + backupAssignmentId + '/promote', data.ownerAuth.token, {
      reason: 'Promotion must fail while the primary assignment remains active.'
    });
    record('confirmed standby cannot replace an active primary', response.status === 409, 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + primaryAssignmentId + '/cancellation-request', data.ownerAuth.token, {
      reason: 'Primary jockey is unavailable before race day.'
    });
    record(
      'owner requests mutual primary cancellation',
      response.status === 201 &&
        response.body.data.assignment.status === 'accepted' &&
        response.body.data.assignment.cancellation_request.status === 'pending',
      'status=' + response.status
    );

    response = await request('POST', '/api/jockey-assignments/' + primaryAssignmentId + '/cancellation-request/respond', data.primaryJockeyAuth.token, {
      decision: 'approve',
      response_message: 'Primary jockey agrees to end the contract.'
    });
    record(
      'primary jockey approves cancellation',
      response.status === 200 &&
        response.body.data.assignment.status === 'cancelled' &&
        response.body.data.assignment.cancellation_request.status === 'approved',
      'status=' + response.status
    );

    response = await request('POST', '/api/jockey-assignments/' + backupAssignmentId + '/promote', data.ownerAuth.token, {
      reason: 'Primary contract ended by mutual agreement.'
    });
    record(
      'owner promotes confirmed standby to primary',
      response.status === 200 &&
        response.body.data.assignment.assignment_type === 'primary' &&
        response.body.data.assignment.status === 'meeting_accepted' &&
        Boolean(response.body.data.assignment.standby_terms) &&
        response.body.data.previous_primary_assignment_id === primaryAssignmentId,
      'status=' + response.status
    );

    const replacedPrimary = await JockeyAssignment.findById(primaryAssignmentId);
    record('previous primary remains cancelled for audit', replacedPrimary && replacedPrimary.status === 'cancelled', 'status=' + (replacedPrimary && replacedPrimary.status));

    response = await request('PATCH', '/api/jockey-assignments/' + backupAssignmentId + '/terms', data.ownerAuth.token, {
      agreed_terms: 'Primary riding terms after the backup jockey promotion.',
      meeting_note: 'Official primary terms recorded after backup promotion.',
      agreed_at: new Date().toISOString()
    });
    record('owner sends terms after backup promotion', response.status === 200 && response.body.data.assignment.status === 'terms_pending_confirmation', 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + backupAssignmentId + '/confirm-terms', data.backupJockeyAuth.token, {
      response_message: 'Promoted primary terms confirmed.'
    });
    record('promoted jockey confirms primary terms', response.status === 200 && response.body.data.assignment.status === 'terms_agreed', 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + backupAssignmentId + '/contract', data.ownerAuth.token, {
      file_url: 'https://example.com/contracts/' + prefix + '-promoted-primary.pdf',
      file_type: 'application/pdf',
      file_name: 'promoted-primary-agreement.pdf'
    });
    record('owner uploads new primary contract after promotion', response.status === 200 && response.body.data.assignment.status === 'contract_uploaded', 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + backupAssignmentId + '/confirm-contract', data.backupJockeyAuth.token, {
      response_message: 'Promoted primary contract confirmed.'
    });
    record('promoted jockey confirms primary contract', response.status === 200 && response.body.data.assignment.status === 'accepted', 'status=' + response.status);

    response = await request('GET', '/api/jockeys/me/schedule', data.backupJockeyAuth.token);
    record('promoted backup appears in jockey schedule', response.status === 200 && response.body.data.schedule.length === 1, 'status=' + response.status);

    response = await request('POST', '/api/horse-checks/pre-race', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: horseId,
      jockey_id: data.backupJockey._id.toString(),
      status: 'passed',
      checklist: {
        identity_verified: true,
        equipment_checked: true,
        health_checked: true
      },
      is_eligible: true,
      check_note: 'Promoted jockey and horse passed pre-race inspection.'
    });
    const preCheckId = response.body && response.body.data && response.body.data.horse_check && response.body.data.horse_check._id;
    addId('checks', preCheckId);
    record('referee records pre-race check for promoted primary', response.status === 201 && Boolean(preCheckId), 'status=' + response.status);

    response = await request('GET', '/api/race-results/races/' + raceId + '/participants', data.refereeAuth.token);
    const participants = response.body && response.body.data && response.body.data.participants || [];
    const participant = participants.find(function(item) {
      return documentId(item.horse) === horseId;
    });
    const participantJockeyId = participant && participant.jockey && documentId(participant.jockey);
    record(
      'race participants use promoted primary assignment only',
      response.status === 200 &&
        participants.filter(function(item) { return item.eligible; }).length === 1 &&
        participant.eligible === true &&
        participantJockeyId === data.backupJockey._id.toString(),
      'status=' + response.status
    );

    response = await request('POST', '/api/races/' + raceId + '/start', data.refereeAuth.token);
    const raceRun = response.body && response.body.data && response.body.data.engine &&
      response.body.data.engine.race_run;
    const runParticipants = raceRun && raceRun.participants || [];
    const runParticipant = runParticipants.find(function(item) {
      return documentId(item.horse_id) === horseId;
    });
    const runAssignmentId = runParticipant && runParticipant.assignment_id && documentId(runParticipant.assignment_id);
    record(
      'race engine provisional order uses promoted assignment',
      response.status === 200 && runAssignmentId === backupAssignmentId,
      'status=' + response.status
    );

    response = await request(
      'POST',
      '/api/jockey-assignments/' + backupAssignmentId + '/cancellation-request',
      data.ownerAuth.token,
      { reason: 'This request must be blocked after the race starts.' }
    );
    record(
      'assignment changes are blocked after the race starts',
      response.status === 409,
      'status=' + response.status
    );

    response = await request('POST', '/api/horse-checks/during-race', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: horseId,
      jockey_id: data.backupJockey._id.toString(),
      status: 'incident_recorded',
      event_type: 'lane_violation',
      severity: 'major',
      description: 'Promoted jockey drifted out of lane.',
      time_marker: '00:45',
      requires_violation: true
    });
    const violationId = response.body && response.body.data && response.body.data.violation && response.body.data.violation._id;
    const duringCheckId = response.body && response.body.data && response.body.data.horse_check && response.body.data.horse_check._id;
    addId('violations', violationId);
    addId('checks', duringCheckId);
    record(
      'referee check creates unresolved violation for promoted jockey',
      response.status === 201 &&
        response.body.data.violation.status === 'recorded' &&
        response.body.data.violation.suggested_penalty.time_penalty_seconds === 3,
      'status=' + response.status
    );

    response = await request('POST', '/api/violations/' + violationId + '/confirm', data.refereeAuth.token, {
      decision: 'Lane violation confirmed after video review.'
    });
    record(
      'referee explicitly confirms promoted jockey penalty',
      response.status === 200 &&
        response.body.data.violation.status === 'confirmed' &&
        response.body.data.violation.penalty.time_penalty_seconds === 3,
      'status=' + response.status
    );

    response = await request('POST', '/api/races/' + raceId + '/complete', data.refereeAuth.token);
    record('assigned referee completes race', response.status === 200 && response.body.data.race.status === 'completed', 'status=' + response.status);

    response = await request('POST', '/api/referee-reports', data.refereeAuth.token, {
      race_id: raceId,
      report_title: 'Backup jockey e2e official report',
      report_content: 'Race completed with promoted backup jockey.',
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

    response = await request('POST', '/api/horse-checks/post-race', data.refereeAuth.token, {
      race_id: raceId,
      horse_id: horseId,
      jockey_id: data.backupJockey._id.toString(),
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

    response = await request('GET', '/api/race-results/races/' + raceId + '/readiness', data.refereeAuth.token);
    record('race is ready after report, post-check, and resolved violation', response.status === 200 && response.body.data.ready === true, 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/apply-penalties', data.refereeAuth.token);
    const draftResults = response.body && response.body.data && response.body.data.engine && response.body.data.engine.results || [];
    const penalizedResult = response.body && response.body.data && response.body.data.results && response.body.data.results[0];
    record(
      'draft is generated and lane violation penalty is applied first',
      response.status === 200 &&
        draftResults.length === 1 &&
        penalizedResult.final_finish_time === Number((penalizedResult.raw_finish_time + 3).toFixed(3)) &&
        penalizedResult.applied_violation_ids.some(function(violation) {
          return (violation._id || violation).toString() === violationId;
        }),
      'status=' + response.status
    );

    response = await request('POST', '/api/race-results/races/' + raceId + '/finalize', data.refereeAuth.token);
    record(
      'referee sends penalty-adjusted final summary to Admin',
      response.status === 200 && Boolean(response.body.data.results[0].submitted_to_admin_at),
      'status=' + response.status
    );

    response = await request('POST', '/api/race-results/races/' + raceId + '/confirm', data.adminAuth.token);
    record('admin confirms race results', response.status === 200 && response.body.data.results[0].status === 'confirmed', 'status=' + response.status);

    response = await request('POST', '/api/race-results/races/' + raceId + '/publish', data.adminAuth.token);
    record('admin publishes race results', response.status === 200 && response.body.data.results[0].status === 'published', 'status=' + response.status);

    response = await request('GET', '/users/spectator/races/' + raceId + '/results', data.spectatorAuth.token);
    record('spectator views published promoted-jockey result', response.status === 200 && response.body.data.results.length === 1, 'status=' + response.status);

    response = await request('POST', '/api/jockey-assignments/' + primaryAssignmentId + '/promote', data.ownerAuth.token, {
      reason: 'Primary assignment is replaced and cannot be promoted.'
    });
    record('cancelled former primary cannot be promoted', response.status === 400, 'status=' + response.status);

    const failures = results.filter(function(result) {
      return !result.passed;
    });

    console.log('SUMMARY:', results.length - failures.length + '/' + results.length + ' passed');
    console.log('CLEANUP_MARKER:', prefix);

    if (failures.length) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('E2E ERROR:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
      console.log('CLEANUP_DONE:', prefix);
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
