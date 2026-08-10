const mongoose = require('mongoose');

const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_TYPE,
  ASSIGNMENT_CANCELLATION_STATUS,
  ASSIGNMENT_CANCELLATION_PARTY,
  REGISTRATION_STATUS
} = require('../constants/statuses');
const { Horse, Jockey, Race, Registration } = require('../models');
const jockeyAssignmentRepository = require('../repositories/jockeyAssignmentRepository');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const cloudinaryService = require('./cloudinaryService');

const STARTED_OR_CLOSED_STATUSES = [
  'starting',
  'started',
  'running',
  'ongoing',
  'in_progress',
  'completed',
  'finished',
  'cancelled',
  'archived'
];
const ACTIVE_ASSIGNMENT_STATUSES = [
  'pending',
  ASSIGNMENT_STATUS.MEETING_INVITED,
  ASSIGNMENT_STATUS.MEETING_ACCEPTED,
  ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION,
  ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION,
  ASSIGNMENT_STATUS.STANDBY_CONFIRMED,
  ASSIGNMENT_STATUS.TERMS_AGREED,
  ASSIGNMENT_STATUS.TERMS_REJECTED,
  ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
  ASSIGNMENT_STATUS.ACCEPTED
];
const WITHDRAWABLE_ASSIGNMENT_STATUSES = [
  'pending',
  ASSIGNMENT_STATUS.MEETING_INVITED,
  ASSIGNMENT_STATUS.MEETING_ACCEPTED,
  ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION,
  ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION,
  ASSIGNMENT_STATUS.TERMS_AGREED,
  ASSIGNMENT_STATUS.TERMS_REJECTED,
  ASSIGNMENT_STATUS.CONTRACT_UPLOADED
];
const BINDING_ASSIGNMENT_STATUSES = [
  ASSIGNMENT_STATUS.ACCEPTED,
  ASSIGNMENT_STATUS.STANDBY_CONFIRMED
];

function hasRole(req, role) {
  return (req.roles || req.auth.roles || []).includes(role);
}

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function hasStartedOrClosed(status) {
  return STARTED_OR_CLOSED_STATUSES.includes((status || '').toLowerCase());
}

function activeAssignmentFilter(extraFilter) {
  return Object.assign({
    status: { $in: ACTIVE_ASSIGNMENT_STATUSES }
  }, extraFilter || {});
}

function isBindingAssignment(assignment) {
  if (assignment.assignment_type === ASSIGNMENT_TYPE.BACKUP) {
    return [
      ASSIGNMENT_STATUS.STANDBY_CONFIRMED,
      ASSIGNMENT_STATUS.TERMS_AGREED,
      ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
      ASSIGNMENT_STATUS.ACCEPTED
    ].includes(assignment.status);
  }

  return assignment.status === ASSIGNMENT_STATUS.ACCEPTED;
}

function cloneSubdocument(value) {
  if (!value) {
    return undefined;
  }

  if (typeof value.toObject === 'function') {
    return value.toObject();
  }

  return Object.assign({}, value);
}

function isJockeySuspended(jockey) {
  return Boolean(jockey && jockey.suspended_until && new Date(jockey.suspended_until).getTime() > Date.now());
}

async function ensureJockeyNotSuspended(jockey) {
  if (isJockeySuspended(jockey)) {
    throw new ApiError(400, 'Suspended jockeys cannot accept or receive new race assignments');
  }

  if (jockey && jockey.disciplinary_status === 'suspended') {
    jockey.disciplinary_status = 'clear';
    await jockey.save();
  }
}

async function resolveOwner(req, payload) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    if (!payload.owner_id) {
      throw new ApiError(400, 'owner_id is required for admin assignment create');
    }

    return payload.owner_id;
  }

  const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

  if (!owner) {
    throw new ApiError(404, 'Horse owner profile not found');
  }

  return owner._id;
}

async function createAssignment(req, payload) {
  const [race, horse, jockey] = await Promise.all([
    raceRepository.findById(payload.race_id),
    Horse.findById(payload.horse_id),
    Jockey.findById(payload.jockey_id)
  ]);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  if (!horse) {
    throw new ApiError(404, 'Horse not found');
  }

  if (!jockey) {
    throw new ApiError(404, 'Jockey not found');
  }

  if (hasStartedOrClosed(race.status)) {
    throw new ApiError(400, 'Jockey cannot be invited after the race has started or finished');
  }

  if (horse.status !== 'active') {
    throw new ApiError(400, 'Only active horses can invite jockeys');
  }

  if (jockey.status !== 'active') {
    throw new ApiError(400, 'Only active jockeys can be invited');
  }

  await ensureJockeyNotSuspended(jockey);

  const ownerId = await resolveOwner(req, payload);

  if (!sameId(horse.owner_id._id || horse.owner_id, ownerId)) {
    throw new ApiError(403, 'Horse does not belong to this owner');
  }

  const eligibleRegistration = await Registration.findOne({
    race_id: payload.race_id,
    horse_id: payload.horse_id,
    owner_id: ownerId,
    status: REGISTRATION_STATUS.APPROVED,
    payment_status: { $in: ['paid', 'not_required'] }
  }).lean();

  if (!eligibleRegistration) {
    throw new ApiError(
      409,
      'A confirmed and fully paid race entry is required before inviting a jockey'
    );
  }

  const meetingTime = new Date(payload.meeting.meeting_time);

  if (race.race_date && meetingTime.getTime() >= new Date(race.race_date).getTime()) {
    throw new ApiError(400, 'The appointment must take place before the race starts');
  }

  const assignmentType = payload.assignment_type || ASSIGNMENT_TYPE.PRIMARY;
  const backupPriority = assignmentType === ASSIGNMENT_TYPE.BACKUP ? 1 : undefined;
  const session = await mongoose.startSession();
  let assignment;

  try {
    await session.withTransaction(async function() {
      const openRace = await Race.findOneAndUpdate({
        _id: payload.race_id,
        status: { $nin: STARTED_OR_CLOSED_STATUSES }
      }, {
        $inc: { assignment_revision: 1 }
      }, {
        returnDocument: 'after',
        runValidators: true,
        session: session
      });

      if (!openRace) {
        throw new ApiError(409, 'Jockey cannot be invited after the race has started or finished');
      }

      const existingPrimary = await jockeyAssignmentRepository.findOne(activeAssignmentFilter({
        race_id: payload.race_id,
        horse_id: payload.horse_id,
        assignment_type: ASSIGNMENT_TYPE.PRIMARY
      }), session);

      if (assignmentType === ASSIGNMENT_TYPE.PRIMARY && existingPrimary) {
        throw new ApiError(409, 'This horse already has an active primary jockey assignment for the selected race', {
          assignment_id: existingPrimary._id,
          status: existingPrimary.status
        });
      }

      if (
        assignmentType === ASSIGNMENT_TYPE.BACKUP
        && (
          !existingPrimary
          || existingPrimary.status !== ASSIGNMENT_STATUS.ACCEPTED
          || existingPrimary.cancellation_request?.status === ASSIGNMENT_CANCELLATION_STATUS.PENDING
        )
      ) {
        throw new ApiError(
          409,
          'An accepted primary jockey without a pending cancellation is required before inviting a backup jockey'
        );
      }

      if (assignmentType === ASSIGNMENT_TYPE.BACKUP) {
        const existingBackup = await jockeyAssignmentRepository.findOne(activeAssignmentFilter({
          race_id: payload.race_id,
          horse_id: payload.horse_id,
          assignment_type: ASSIGNMENT_TYPE.BACKUP
        }), session);

        if (existingBackup) {
          throw new ApiError(409, 'This horse already has an active backup jockey assignment for the selected race', {
            assignment_id: existingBackup._id,
            status: existingBackup.status
          });
        }
      }

      const existingSameJockey = await jockeyAssignmentRepository.findOne(activeAssignmentFilter({
        race_id: payload.race_id,
        horse_id: payload.horse_id,
        jockey_id: payload.jockey_id
      }), session);

      if (existingSameJockey) {
        throw new ApiError(409, 'This jockey already has an active assignment for the selected horse and race', {
          assignment_id: existingSameJockey._id,
          assignment_type: existingSameJockey.assignment_type,
          status: existingSameJockey.status
        });
      }

      assignment = await jockeyAssignmentRepository.create({
        race_id: payload.race_id,
        horse_id: payload.horse_id,
        owner_id: ownerId,
        jockey_id: payload.jockey_id,
        assignment_type: assignmentType,
        backup_priority: assignmentType === ASSIGNMENT_TYPE.BACKUP ? backupPriority : undefined,
        backup_for_assignment_id: assignmentType === ASSIGNMENT_TYPE.BACKUP ? existingPrimary._id : undefined,
        invitation_message: payload.invitation_message,
        meeting: payload.meeting,
        status: ASSIGNMENT_STATUS.MEETING_INVITED,
        invited_at: new Date()
      }, session);
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, assignmentType === ASSIGNMENT_TYPE.BACKUP
        ? 'This horse already has an active backup jockey assignment for the selected race'
        : 'This horse already has an active primary jockey assignment for the selected race');
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return {
    assignment: assignment
  };
}

async function listAssignments(req, query) {
  const filter = {};

  ['race_id', 'horse_id', 'owner_id', 'jockey_id', 'status', 'assignment_type'].forEach(function(field) {
    if (query[field]) {
      filter[field] = query[field];
    }
  });

  if (hasRole(req, ROLE_NAMES.HORSE_OWNER) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (!owner) {
      throw new ApiError(404, 'Horse owner profile not found');
    }

    filter.owner_id = owner._id;
  }

  if (hasRole(req, ROLE_NAMES.JOCKEY) && !hasRole(req, ROLE_NAMES.ADMIN) && !hasRole(req, ROLE_NAMES.HORSE_OWNER)) {
    const jockey = await profileRepository.findJockeyByUserId(req.user._id);

    if (!jockey) {
      throw new ApiError(404, 'Jockey profile not found');
    }

    filter.jockey_id = jockey._id;
  }

  return {
    assignments: await jockeyAssignmentRepository.find(filter)
  };
}

async function ensureCanViewAssignment(req, assignment) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    return;
  }

  if (hasRole(req, ROLE_NAMES.HORSE_OWNER)) {
    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (owner && sameId(assignment.owner_id._id || assignment.owner_id, owner._id)) {
      return;
    }
  }

  if (hasRole(req, ROLE_NAMES.JOCKEY)) {
    const jockey = await profileRepository.findJockeyByUserId(req.user._id);

    if (jockey && sameId(assignment.jockey_id._id || assignment.jockey_id, jockey._id)) {
      return;
    }
  }

  throw new ApiError(403, 'You do not have permission to view this assignment');
}

async function getAssignment(req, id) {
  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  await ensureCanViewAssignment(req, assignment);

  return {
    assignment: assignment
  };
}

async function cancelAssignment(req, id) {
  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  if (!hasRole(req, ROLE_NAMES.ADMIN)) {
    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (!owner || !sameId(assignment.owner_id._id || assignment.owner_id, owner._id)) {
      throw new ApiError(403, 'You do not have permission to cancel this assignment');
    }
  }

  if (!['pending', ASSIGNMENT_STATUS.MEETING_INVITED].includes(assignment.status)) {
    throw new ApiError(409, 'Only pending jockey invitations can be cancelled');
  }

  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: assignment.status
  }, {
    $set: {
      status: ASSIGNMENT_STATUS.CANCELLED,
      responded_at: new Date()
    }
  }, 'The invitation changed before it could be cancelled');

  return {
    assignment: updatedAssignment
  };
}

async function ensureJockeyHasNoRaceBinding(assignment, jockeyId) {
  const raceId = assignment.race_id._id || assignment.race_id;
  const conflict = await jockeyAssignmentRepository.findOne({
    _id: { $ne: assignment._id },
    race_id: raceId,
    jockey_id: jockeyId,
    status: { $in: BINDING_ASSIGNMENT_STATUSES }
  });

  if (conflict) {
    throw new ApiError(409, 'This jockey is already confirmed for another horse in the selected race', {
      assignment_id: conflict._id,
      horse_id: conflict.horse_id,
      assignment_type: conflict.assignment_type
    });
  }
}

async function resolveCancellationActor(req, assignment) {
  if (hasRole(req, ROLE_NAMES.HORSE_OWNER)) {
    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (owner && sameId(assignment.owner_id._id || assignment.owner_id, owner._id)) {
      return {
        party: ASSIGNMENT_CANCELLATION_PARTY.HORSE_OWNER,
        profile: owner
      };
    }
  }

  if (hasRole(req, ROLE_NAMES.JOCKEY)) {
    const jockey = await profileRepository.findJockeyByUserId(req.user._id);

    if (jockey && sameId(assignment.jockey_id._id || assignment.jockey_id, jockey._id)) {
      return {
        party: ASSIGNMENT_CANCELLATION_PARTY.JOCKEY,
        profile: jockey
      };
    }
  }

  throw new ApiError(403, 'You are not a party to this jockey assignment');
}

async function withdrawAssignment(req, id, payload) {
  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  const actor = await resolveCancellationActor(req, assignment);

  if (isBindingAssignment(assignment)) {
    throw new ApiError(
      409,
      'This assignment is already binding; both parties must use mutual cancellation'
    );
  }

  if (!WITHDRAWABLE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
    throw new ApiError(
      409,
      'This assignment cannot be withdrawn at its current stage; use mutual cancellation after it becomes active'
    );
  }

  const withdrawnAt = new Date();
  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: assignment.status
  }, {
    $set: {
      status: ASSIGNMENT_STATUS.CANCELLED,
      withdrawal: {
        initiated_by_party: actor.party,
        initiated_by: req.user._id,
        reason: payload.reason,
        withdrawn_at: withdrawnAt
      },
      responded_at: withdrawnAt
    }
  }, 'The assignment changed before it could be withdrawn');

  return {
    assignment: updatedAssignment
  };
}

async function mutateAssignmentWhileRaceOpen(assignment, filter, update, conflictMessage) {
  const raceId = assignment.race_id._id || assignment.race_id;
  const session = await mongoose.startSession();
  let updatedAssignment;

  try {
    await session.withTransaction(async function() {
      const openRace = await Race.findOneAndUpdate({
        _id: raceId,
        status: { $nin: STARTED_OR_CLOSED_STATUSES }
      }, {
        $inc: { assignment_revision: 1 }
      }, {
        returnDocument: 'after',
        runValidators: true,
        session: session
      });

      if (!openRace) {
        throw new ApiError(409, 'A jockey assignment cannot be changed after the race has started');
      }

      updatedAssignment = await jockeyAssignmentRepository.updateOne(filter, update, session);

      if (!updatedAssignment) {
        throw new ApiError(409, conflictMessage);
      }
    });
  } catch (error) {
    if (error && error.code === 11000 && error.keyPattern && error.keyPattern.jockey_id) {
      throw new ApiError(409, 'This jockey is already confirmed for another horse in the selected race');
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return updatedAssignment;
}

async function requestCancellation(req, id, payload) {
  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  const actor = await resolveCancellationActor(req, assignment);

  if (!isBindingAssignment(assignment)) {
    throw new ApiError(
      409,
      'Mutual cancellation is only available for an accepted primary contract or confirmed standby agreement'
    );
  }

  if (assignment.cancellation_request?.status === ASSIGNMENT_CANCELLATION_STATUS.PENDING) {
    throw new ApiError(409, 'This assignment already has a pending cancellation request');
  }

  const requestedAt = new Date();
  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: assignment.status,
    'cancellation_request.status': { $ne: ASSIGNMENT_CANCELLATION_STATUS.PENDING }
  }, {
    $set: {
      cancellation_request: {
        status: ASSIGNMENT_CANCELLATION_STATUS.PENDING,
        initiated_by_party: actor.party,
        initiated_by: req.user._id,
        reason: payload.reason,
        requested_at: requestedAt
      }
    }
  }, 'The assignment changed while the cancellation request was being created');

  return {
    assignment: updatedAssignment
  };
}

async function respondToCancellation(req, id, payload) {
  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  const actor = await resolveCancellationActor(req, assignment);
  const cancellationRequest = assignment.cancellation_request;

  if (
    !isBindingAssignment(assignment) ||
    !cancellationRequest ||
    cancellationRequest.status !== ASSIGNMENT_CANCELLATION_STATUS.PENDING
  ) {
    throw new ApiError(409, 'This assignment has no pending cancellation request');
  }

  if (cancellationRequest.initiated_by_party === actor.party) {
    throw new ApiError(403, 'The party that requested cancellation cannot approve or reject its own request');
  }

  const approved = payload.decision === 'approve';
  const responseStatus = approved
    ? ASSIGNMENT_CANCELLATION_STATUS.APPROVED
    : ASSIGNMENT_CANCELLATION_STATUS.REJECTED;
  const respondedAt = new Date();
  const update = {
    'cancellation_request.status': responseStatus,
    'cancellation_request.responded_by_party': actor.party,
    'cancellation_request.responded_by': req.user._id,
    'cancellation_request.response_message': payload.response_message,
    'cancellation_request.responded_at': respondedAt
  };

  if (approved) {
    update.status = ASSIGNMENT_STATUS.CANCELLED;
    update.responded_at = respondedAt;
  }

  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: assignment.status,
    'cancellation_request.status': ASSIGNMENT_CANCELLATION_STATUS.PENDING,
    'cancellation_request.initiated_by_party': { $ne: actor.party }
  }, {
    $set: update
  }, 'The cancellation request has already been resolved');

  return {
    assignment: updatedAssignment
  };
}

async function respondToMeeting(userId, id, status, responseMessage) {
  const jockey = await profileRepository.findJockeyByUserId(userId);

  if (!jockey) {
    throw new ApiError(404, 'Jockey profile not found');
  }

  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  if (!sameId(assignment.jockey_id._id || assignment.jockey_id, jockey._id)) {
    throw new ApiError(403, 'You do not have permission to respond to this assignment');
  }

  if (!['pending', ASSIGNMENT_STATUS.MEETING_INVITED].includes(assignment.status)) {
    throw new ApiError(400, 'Only appointment invitations can be accepted or rejected');
  }

  if (status === ASSIGNMENT_STATUS.MEETING_ACCEPTED) {
    await ensureJockeyNotSuspended(jockey);
  }

  const meeting = Object.assign({}, assignment.meeting ? assignment.meeting.toObject() : {});

  meeting.response_message = responseMessage;

  if (status === ASSIGNMENT_STATUS.MEETING_ACCEPTED) {
    meeting.accepted_at = new Date();
  }

  if (status === ASSIGNMENT_STATUS.MEETING_REJECTED) {
    meeting.rejected_at = new Date();
  }

  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: assignment.status
  }, {
    $set: {
      status: status,
      response_message: responseMessage,
      meeting: meeting,
      responded_at: new Date()
    }
  }, 'The appointment invitation changed before your response was saved');

  return {
    assignment: updatedAssignment
  };
}

async function acceptMeeting(userId, id, responseMessage) {
  return respondToMeeting(userId, id, ASSIGNMENT_STATUS.MEETING_ACCEPTED, responseMessage);
}

async function rejectMeeting(userId, id, responseMessage) {
  return respondToMeeting(userId, id, ASSIGNMENT_STATUS.MEETING_REJECTED, responseMessage);
}

async function ensureOwnerCanMutate(req, assignment, action) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    return;
  }

  const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

  if (!owner || !sameId(assignment.owner_id._id || assignment.owner_id, owner._id)) {
    throw new ApiError(403, 'You do not have permission to ' + action + ' this assignment');
  }
}

async function updateTerms(req, id, payload) {
  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  await ensureOwnerCanMutate(req, assignment, 'update terms for');

  if (![ASSIGNMENT_STATUS.MEETING_ACCEPTED, ASSIGNMENT_STATUS.TERMS_REJECTED].includes(assignment.status)) {
    throw new ApiError(400, 'Terms can only be sent after the jockey accepts the appointment invitation');
  }

  const pendingStatus = assignment.assignment_type === ASSIGNMENT_TYPE.BACKUP
    ? ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION
    : ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION;
  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: assignment.status
  }, {
    $set: {
      status: pendingStatus,
      terms: {
        agreed_terms: payload.agreed_terms,
        meeting_note: payload.meeting_note,
        agreed_at: payload.agreed_at || new Date(),
        sent_at: new Date(),
        updated_by: req.user._id
      }
    }
  }, 'The assignment changed before the terms were saved');

  return {
    assignment: updatedAssignment
  };
}

async function respondToTerms(userId, id, status, responseMessage) {
  const jockey = await profileRepository.findJockeyByUserId(userId);

  if (!jockey) {
    throw new ApiError(404, 'Jockey profile not found');
  }

  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  if (!sameId(assignment.jockey_id._id || assignment.jockey_id, jockey._id)) {
    throw new ApiError(403, 'You do not have permission to respond to these terms');
  }

  const expectedPendingStatus = assignment.assignment_type === ASSIGNMENT_TYPE.BACKUP
    ? [
      ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION,
      ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION
    ]
    : ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION;

  if (
    Array.isArray(expectedPendingStatus)
      ? !expectedPendingStatus.includes(assignment.status)
      : assignment.status !== expectedPendingStatus
  ) {
    throw new ApiError(400, 'Only terms awaiting confirmation can be accepted or rejected');
  }

  const confirmedStatus = assignment.assignment_type === ASSIGNMENT_TYPE.BACKUP
    ? ASSIGNMENT_STATUS.STANDBY_CONFIRMED
    : ASSIGNMENT_STATUS.TERMS_AGREED;
  const nextStatus = status === ASSIGNMENT_STATUS.TERMS_AGREED
    ? confirmedStatus
    : ASSIGNMENT_STATUS.TERMS_REJECTED;

  if (nextStatus === confirmedStatus) {
    await ensureJockeyNotSuspended(jockey);
    await ensureJockeyHasNoRaceBinding(assignment, jockey._id);
  }

  const terms = Object.assign({}, assignment.terms ? assignment.terms.toObject() : {});
  terms.response_message = responseMessage;

  if (nextStatus === confirmedStatus) {
    terms.confirmed_at = new Date();
  }

  if (nextStatus === ASSIGNMENT_STATUS.TERMS_REJECTED) {
    terms.rejected_at = new Date();
  }

  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: assignment.status
  }, {
    $set: {
      status: nextStatus,
      response_message: responseMessage,
      terms: terms,
      responded_at: new Date()
    }
  }, 'The assignment changed before your terms response was saved');

  return {
    assignment: updatedAssignment
  };
}

async function confirmTerms(userId, id, responseMessage) {
  return respondToTerms(userId, id, ASSIGNMENT_STATUS.TERMS_AGREED, responseMessage);
}

async function rejectTerms(userId, id, responseMessage) {
  return respondToTerms(userId, id, ASSIGNMENT_STATUS.TERMS_REJECTED, responseMessage);
}

async function uploadContract(req, id, payload) {
  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  await ensureOwnerCanMutate(req, assignment, 'upload contract for');

  if (assignment.assignment_type !== ASSIGNMENT_TYPE.PRIMARY) {
    throw new ApiError(400, 'Backup jockeys confirm standby terms and do not upload a riding contract');
  }

  if (assignment.status !== ASSIGNMENT_STATUS.TERMS_AGREED) {
    throw new ApiError(400, 'Contract can only be sent after the jockey confirms the terms');
  }

  const contractPayload = Object.assign({}, payload.contract);
  const contractUpload = await cloudinaryService.uploadOptionalSource(
    contractPayload.file_data,
    contractPayload.file_url,
    { folder: 'horse-racing/contracts', resource_type: 'auto' }
  );

  delete contractPayload.file_data;

  if (contractUpload) {
    contractPayload.file_url = contractUpload.secure_url;
    contractPayload.file_public_id = contractUpload.public_id;
  }

  contractPayload.uploaded_at = new Date();

  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: ASSIGNMENT_STATUS.TERMS_AGREED,
    assignment_type: ASSIGNMENT_TYPE.PRIMARY
  }, {
    $set: {
      status: ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
      contract: contractPayload
    }
  }, 'The assignment changed before the contract was saved');

  return {
    assignment: updatedAssignment
  };
}

async function promoteBackup(req, id, payload) {
  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  await ensureOwnerCanMutate(req, assignment, 'promote');

  if (assignment.assignment_type !== ASSIGNMENT_TYPE.BACKUP) {
    throw new ApiError(400, 'Only backup jockey assignments can be promoted');
  }

  if (![
    ASSIGNMENT_STATUS.STANDBY_CONFIRMED,
    ASSIGNMENT_STATUS.TERMS_AGREED,
    ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
    ASSIGNMENT_STATUS.ACCEPTED
  ].includes(assignment.status)) {
    throw new ApiError(400, 'Only confirmed standby assignments can be promoted');
  }

  const raceId = assignment.race_id._id || assignment.race_id;
  const horseId = assignment.horse_id._id || assignment.horse_id;
  const race = await raceRepository.findById(raceId);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  if (hasStartedOrClosed(race.status)) {
    throw new ApiError(400, 'Backup jockey cannot be promoted after the race has started or finished');
  }

  const session = await mongoose.startSession();
  let previousPrimaryAssignmentId = null;

  try {
    await session.withTransaction(async function() {
      const transactionalRace = await Race.findOneAndUpdate({
        _id: raceId,
        status: { $nin: STARTED_OR_CLOSED_STATUSES }
      }, {
        $inc: { assignment_revision: 1 }
      }, {
        returnDocument: 'after',
        runValidators: true,
        session: session
      });

      if (!transactionalRace) {
        throw new ApiError(409, 'Backup jockey cannot be promoted after the race has started or finished');
      }

      const transactionalBackup = await jockeyAssignmentRepository.findOne({
        _id: id,
        assignment_type: ASSIGNMENT_TYPE.BACKUP,
        status: {
          $in: [
            ASSIGNMENT_STATUS.STANDBY_CONFIRMED,
            ASSIGNMENT_STATUS.TERMS_AGREED,
            ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
            ASSIGNMENT_STATUS.ACCEPTED
          ]
        }
      }, session);

      if (!transactionalBackup) {
        throw new ApiError(409, 'The backup assignment changed before it could be promoted');
      }

      if (transactionalBackup.cancellation_request?.status === ASSIGNMENT_CANCELLATION_STATUS.PENDING) {
        throw new ApiError(409, 'Resolve the backup cancellation request before promotion');
      }

      const currentPrimary = await jockeyAssignmentRepository.findOne(activeAssignmentFilter({
        race_id: raceId,
        horse_id: horseId,
        assignment_type: ASSIGNMENT_TYPE.PRIMARY
      }), session);

      if (currentPrimary) {
        throw new ApiError(
          409,
          'The active primary assignment must end before promoting a backup jockey'
        );
      }

      const standbyTerms = cloneSubdocument(transactionalBackup.terms);
      const standbyContract = cloneSubdocument(transactionalBackup.contract);
      previousPrimaryAssignmentId = transactionalBackup.backup_for_assignment_id || null;
      const promotedAt = new Date();
      const promotedAssignment = await jockeyAssignmentRepository.updateOne({
        _id: id,
        assignment_type: ASSIGNMENT_TYPE.BACKUP,
        status: transactionalBackup.status
      }, {
        $set: {
          assignment_type: ASSIGNMENT_TYPE.PRIMARY,
          backup_for_assignment_id: previousPrimaryAssignmentId,
          status: ASSIGNMENT_STATUS.MEETING_ACCEPTED,
          terms: {},
          contract: {},
          standby_terms: standbyTerms,
          standby_contract: standbyContract,
          promotion: {
            promoted_at: promotedAt,
            promoted_by: req.user._id,
            reason: payload.reason,
            previous_primary_assignment_id: previousPrimaryAssignmentId
          },
          responded_at: promotedAt
        },
        $unset: {
          backup_priority: 1
        }
      }, session);

      if (!promotedAssignment) {
        throw new ApiError(409, 'The backup assignment changed before promotion completed');
      }
    });
  } finally {
    await session.endSession();
  }

  const updatedAssignment = await jockeyAssignmentRepository.findById(id);

  return {
    assignment: updatedAssignment,
    previous_primary_assignment_id: previousPrimaryAssignmentId
  };
}

async function respondToContract(userId, id, status, responseMessage) {
  const jockey = await profileRepository.findJockeyByUserId(userId);

  if (!jockey) {
    throw new ApiError(404, 'Jockey profile not found');
  }

  const assignment = await jockeyAssignmentRepository.findById(id);

  if (!assignment) {
    throw new ApiError(404, 'Jockey assignment not found');
  }

  if (!sameId(assignment.jockey_id._id || assignment.jockey_id, jockey._id)) {
    throw new ApiError(403, 'You do not have permission to respond to this assignment contract');
  }

  if (assignment.assignment_type !== ASSIGNMENT_TYPE.PRIMARY) {
    throw new ApiError(400, 'Backup jockeys confirm standby terms and do not confirm a riding contract');
  }

  if (assignment.status !== ASSIGNMENT_STATUS.CONTRACT_UPLOADED) {
    throw new ApiError(400, 'Only uploaded contracts can be confirmed or rejected');
  }

  if (status === ASSIGNMENT_STATUS.ACCEPTED) {
    await ensureJockeyNotSuspended(jockey);
    await ensureJockeyHasNoRaceBinding(assignment, jockey._id);
  }

  const contract = Object.assign({}, assignment.contract ? assignment.contract.toObject() : {});

  contract.response_message = responseMessage;

  if (status === ASSIGNMENT_STATUS.ACCEPTED) {
    contract.confirmed_at = new Date();
  }

  if (status === ASSIGNMENT_STATUS.CONTRACT_REJECTED) {
    contract.rejected_at = new Date();
  }

  const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
    _id: id,
    status: ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
    assignment_type: ASSIGNMENT_TYPE.PRIMARY
  }, {
    $set: {
      status: status,
      response_message: responseMessage,
      contract: contract,
      responded_at: new Date()
    }
  }, 'The assignment changed before your contract response was saved');

  return {
    assignment: updatedAssignment
  };
}

async function confirmContract(userId, id, responseMessage) {
  return respondToContract(userId, id, ASSIGNMENT_STATUS.ACCEPTED, responseMessage);
}

async function rejectContract(userId, id, responseMessage) {
  return respondToContract(userId, id, ASSIGNMENT_STATUS.CONTRACT_REJECTED, responseMessage);
}

module.exports = {
  createAssignment,
  listAssignments,
  getAssignment,
  cancelAssignment,
  withdrawAssignment,
  requestCancellation,
  respondToCancellation,
  respondToMeeting,
  acceptMeeting,
  rejectMeeting,
  updateTerms,
  respondToTerms,
  confirmTerms,
  rejectTerms,
  uploadContract,
  promoteBackup,
  respondToContract,
  confirmContract,
  rejectContract
};
