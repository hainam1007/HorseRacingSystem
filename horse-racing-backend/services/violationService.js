const ApiError = require('../utils/ApiError');
const { Op } = require('sequelize');
const { ROLE_NAMES } = require('../constants/roles');
const {
  PENALTY_TYPE,
  VIOLATION_SEVERITY,
  VIOLATION_STATUS,
  VIOLATION_TYPE
} = require('../constants/statuses');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const raceResultRepository = require('../repositories/raceResultRepository');
const violationRepository = require('../repositories/violationRepository');
const cloudinaryService = require('./cloudinaryService');
const {
  DECISION_SCOPE,
  getAllViolationPenaltyPolicies,
  getViolationPenaltyPolicy
} = require('../constants/violationPenaltyPolicy');

const PENALTY_NUMBER_FIELDS = [
  'score_deduction',
  'position_delta',
  'time_penalty_seconds',
  'suspension_days',
  'fine_amount'
];

function hasRole(req, role) {
  return (req.roles || req.auth.roles || []).includes(role);
}

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function getDocumentId(value) {
  if (!value) return value;
  if (typeof value === 'string') return value;
  return value._id || value.id || (typeof value.get === 'function' ? value.get('id') : value);
}

function plainPenalty(value) {
  if (!value) {
    return null;
  }

  const source = typeof value.toObject === 'function' ? value.toObject() : value;

  if (!source.type) {
    return null;
  }

  return {
    type: source.type,
    score_deduction: Number(source.score_deduction || 0),
    position_delta: Number(source.position_delta || 0),
    time_penalty_seconds: Number(source.time_penalty_seconds || 0),
    suspension_days: Number(source.suspension_days || 0),
    fine_amount: Number(source.fine_amount || 0),
    disqualified: source.disqualified === true,
    note: source.note || ''
  };
}

function penaltiesMatch(first, second) {
  const normalizedFirst = plainPenalty(first);
  const normalizedSecond = plainPenalty(second);

  if (!normalizedFirst || !normalizedSecond || normalizedFirst.type !== normalizedSecond.type) {
    return false;
  }

  return PENALTY_NUMBER_FIELDS.every(function(field) {
    return normalizedFirst[field] === normalizedSecond[field];
  }) && normalizedFirst.disqualified === normalizedSecond.disqualified;
}

function isStepAligned(value, bound) {
  const steps = (value - bound.min) / bound.step;

  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

function isRefereeProposalWithinBounds(proposal, adjustment) {
  const normalized = plainPenalty(proposal);

  if (
    !normalized ||
    !adjustment ||
    adjustment.allowed !== true ||
    !adjustment.primary_types.includes(normalized.type)
  ) {
    return false;
  }

  if (
    normalized.disqualified !== (normalized.type === PENALTY_TYPE.DISQUALIFICATION)
  ) {
    return false;
  }

  return PENALTY_NUMBER_FIELDS.every(function(field) {
    const value = normalized[field];

    if (value === 0) {
      return true;
    }

    const bound = adjustment.bounds[field];

    return Boolean(
      bound &&
      value >= bound.min &&
      value <= bound.max &&
      isStepAligned(value, bound)
    );
  });
}

function getSuggestedPenalty(violation, policy) {
  return plainPenalty(violation.suggested_penalty) || plainPenalty(policy.suggested_penalty);
}

function policyWithSnapshot(policy, suggestedPenalty) {
  return Object.assign({}, policy, {
    suggested_penalty: suggestedPenalty
  });
}

async function ensureRaceResultsOpen(raceId) {
  const lockedResults = await raceResultRepository.find({
    race_id: raceId,
    [Op.or]: [
      { status: { [Op.in]: ['confirmed', 'published'] } },
      { submitted_to_admin_at: { [Op.ne]: null } }
    ]
  });

  if (lockedResults.length) {
    throw new ApiError(409, 'Violation decisions are locked after race results are submitted to Admin');
  }
}

async function uploadEvidenceFiles(files) {
  const uploadedFiles = [];

  for (const file of files || []) {
    const upload = file.file_data
      ? await cloudinaryService.uploadOptionalSource(
        file.file_data,
        null,
        { folder: 'horse-racing/violations', resource_type: 'auto' }
      )
      : null;

    uploadedFiles.push({
      url: upload ? upload.secure_url : file.url,
      public_id: upload ? upload.public_id : undefined,
      type: file.type,
      file_name: file.file_name
    });
  }

  return uploadedFiles;
}

async function ensureCanManageViolation(req, violation) {
  if (hasRole(req, ROLE_NAMES.ADMIN)) {
    return;
  }

  const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

  if (!referee || !sameId(getDocumentId(violation.referee_id), referee._id)) {
    throw new ApiError(403, 'You can only manage violations recorded by you');
  }
}

async function createViolation(req, payload) {
  const race = await raceRepository.findById(payload.race_id);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  await ensureRaceResultsOpen(race._id);
  let refereeId = payload.referee_id;

  if (!hasRole(req, ROLE_NAMES.ADMIN)) {
    const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

    if (!referee) {
      throw new ApiError(404, 'Race referee profile not found');
    }

    refereeId = referee._id;

    if (!sameId(getDocumentId(race.referee_id), referee._id)) {
      throw new ApiError(403, 'You can only record violations for races assigned to you');
    }
  }

  if (!refereeId) {
    throw new ApiError(400, 'referee_id is required');
  }

  const evidenceFiles = await uploadEvidenceFiles(payload.evidence_files);
  const policy = getViolationPenaltyPolicy(payload.violation_type, payload.severity);
  const createData = Object.assign({}, payload, {
    referee_id: refereeId,
    evidence_files: evidenceFiles,
    evidence_urls: evidenceFiles.map(function(file) {
      return file.url;
    }).filter(Boolean),
    status: policy.requires_review
      ? VIOLATION_STATUS.UNDER_REVIEW
      : payload.status,
    suggested_penalty: policy.suggested_penalty,
    policy_version: policy.policy_version,
    created_at: new Date()
  });

  delete createData.auto_confirm;

  const violation = await violationRepository.create(createData);

  return {
    violation: violation,
    policy: policy,
    auto_confirmed: false
  };
}

async function listViolations(req, query) {
  const filter = {};

  ['race_id', 'horse_id', 'jockey_id', 'referee_id', 'horse_check_id', 'status', 'severity', 'violation_type'].forEach(function(field) {
    if (query[field]) {
      filter[field] = query[field];
    }
  });

  if (hasRole(req, ROLE_NAMES.RACE_REFEREE) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

    if (!referee) {
      throw new ApiError(404, 'Race referee profile not found');
    }

    filter.referee_id = referee._id;
  }

  if (hasRole(req, ROLE_NAMES.JOCKEY) && !hasRole(req, ROLE_NAMES.ADMIN) && !hasRole(req, ROLE_NAMES.RACE_REFEREE)) {
    const jockey = await profileRepository.findJockeyByUserId(req.user._id);

    if (!jockey) {
      throw new ApiError(404, 'Jockey profile not found');
    }

    filter.jockey_id = jockey._id;
  }

  return {
    violations: await violationRepository.find(filter)
  };
}

async function getViolation(req, id) {
  const violation = await violationRepository.findById(id);

  if (!violation) {
    throw new ApiError(404, 'Violation not found');
  }

  if (!hasRole(req, ROLE_NAMES.ADMIN)) {
    let canView = false;

    if (hasRole(req, ROLE_NAMES.RACE_REFEREE)) {
      const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);
      const assignedRefereeId = violation.race_id && getDocumentId(violation.race_id.referee_id);
      const recordingRefereeId = getDocumentId(violation.referee_id);

      canView = Boolean(referee) && (
        sameId(assignedRefereeId, referee._id) || sameId(recordingRefereeId, referee._id)
      );
    }

    if (!canView && hasRole(req, ROLE_NAMES.JOCKEY)) {
      const jockey = await profileRepository.findJockeyByUserId(req.user._id);

      canView = Boolean(jockey) && sameId(getDocumentId(violation.jockey_id), jockey._id);
    }

    if (!canView) {
      throw new ApiError(403, 'You do not have permission to view this violation');
    }
  }

  return {
    violation: violation
  };
}

async function updateViolation(req, id, payload) {
  const existingViolation = await violationRepository.findById(id);

  if (!existingViolation) {
    throw new ApiError(404, 'Violation not found');
  }

  await ensureCanManageViolation(req, existingViolation);
  await ensureRaceResultsOpen(getDocumentId(existingViolation.race_id));

  if (![VIOLATION_STATUS.RECORDED, VIOLATION_STATUS.UNDER_REVIEW].includes(existingViolation.status)) {
    throw new ApiError(400, 'Only unresolved violations can be updated');
  }

  const updateData = Object.assign({}, payload);

  if (payload.evidence_files) {
    updateData.evidence_files = await uploadEvidenceFiles(payload.evidence_files);
    updateData.evidence_urls = updateData.evidence_files.map(function(file) {
      return file.url;
    }).filter(Boolean);
  }

  if (payload.severity) {
    const policy = getViolationPenaltyPolicy(existingViolation.violation_type, payload.severity);

    updateData.suggested_penalty = policy.suggested_penalty;
    updateData.policy_version = policy.policy_version;
    updateData.proposed_penalty = null;
    updateData.penalty = null;
    updateData.deviates_from_policy = false;
    updateData.deviation_reason = null;
    updateData.decision_scope = null;
    updateData.proposed_by = null;
    updateData.proposed_at = null;
    updateData.decision = null;
    updateData.decided_by = null;
    updateData.decided_at = null;
    updateData.penalty_source = null;

  }

  const violation = await violationRepository.updateById(id, updateData);

  if (!violation) {
    throw new ApiError(404, 'Violation not found');
  }

  return {
    violation: violation
  };
}

async function confirmViolation(req, id, payload) {
  const violation = await violationRepository.findById(id);

  if (!violation) {
    throw new ApiError(404, 'Violation not found');
  }

  await ensureCanManageViolation(req, violation);
  await ensureRaceResultsOpen(getDocumentId(violation.race_id));

  if (![VIOLATION_STATUS.RECORDED, VIOLATION_STATUS.UNDER_REVIEW].includes(violation.status)) {
    throw new ApiError(400, 'Only unresolved violations can be confirmed');
  }

  const policy = getViolationPenaltyPolicy(violation.violation_type, violation.severity);
  const isAdmin = hasRole(req, ROLE_NAMES.ADMIN);
  const suggestedPenalty = getSuggestedPenalty(violation, policy);
  const existingProposal = plainPenalty(violation.proposed_penalty);
  const submittedPenalty = plainPenalty(payload.penalty);
  const proposedPenalty = submittedPenalty || (isAdmin && existingProposal) || suggestedPenalty;
  const deviationReason = payload.deviation_reason || violation.deviation_reason;
  const deviatesFromPolicy = !penaltiesMatch(proposedPenalty, suggestedPenalty);
  const effectivePolicy = policyWithSnapshot(policy, suggestedPenalty);

  if (deviatesFromPolicy && !deviationReason) {
    throw new ApiError(400, 'deviation_reason is required when the proposed penalty differs from policy');
  }

  if (!isAdmin) {
    if (!isRefereeProposalWithinBounds(proposedPenalty, policy.referee_adjustment)) {
      throw new ApiError(400, 'The selected penalty is outside the allowed range for this severity');
    }

    const refereeScope = deviatesFromPolicy
      ? DECISION_SCOPE.REFEREE_ADJUSTMENT
      : DECISION_SCOPE.REFEREE_POLICY_MATCH;
    const proposalData = {
      status: VIOLATION_STATUS.CONFIRMED,
      suggested_penalty: suggestedPenalty,
      proposed_penalty: proposedPenalty,
      penalty: proposedPenalty,
      decision: payload.decision,
      deviates_from_policy: deviatesFromPolicy,
      deviation_reason: deviatesFromPolicy ? deviationReason : null,
      decision_scope: refereeScope,
      proposed_by: req.user._id,
      proposed_at: new Date(),
      decided_by: req.user._id,
      decided_at: new Date(),
      penalty_source: deviatesFromPolicy
        ? 'referee_adjustment'
        : 'policy_confirm',
      policy_version: violation.policy_version || policy.policy_version
    };

    return {
      violation: await violationRepository.updateById(id, proposalData),
      policy: effectivePolicy,
      requires_admin_review: false
    };
  }

  const adminScope = !submittedPenalty && existingProposal
    ? DECISION_SCOPE.ADMIN_APPROVAL
    : deviatesFromPolicy
      ? DECISION_SCOPE.ADMIN_OVERRIDE
      : DECISION_SCOPE.ADMIN_POLICY_MATCH;

  return {
    violation: await violationRepository.updateById(id, {
      status: VIOLATION_STATUS.CONFIRMED,
      decision: payload.decision,
      suggested_penalty: suggestedPenalty,
      proposed_penalty: proposedPenalty,
      penalty: proposedPenalty,
      deviates_from_policy: deviatesFromPolicy,
      deviation_reason: deviatesFromPolicy ? deviationReason : null,
      decision_scope: adminScope,
      proposed_by: submittedPenalty ? req.user._id : violation.proposed_by,
      proposed_at: submittedPenalty ? new Date() : violation.proposed_at,
      decided_by: req.user._id,
      decided_at: new Date(),
      penalty_source: 'manual_admin',
      policy_version: violation.policy_version || policy.policy_version
    }),
    policy: effectivePolicy,
    requires_admin_review: false
  };
}

async function dismissViolation(req, id, payload) {
  const violation = await violationRepository.findById(id);

  if (!violation) {
    throw new ApiError(404, 'Violation not found');
  }

  await ensureCanManageViolation(req, violation);
  await ensureRaceResultsOpen(getDocumentId(violation.race_id));

  if (![VIOLATION_STATUS.RECORDED, VIOLATION_STATUS.UNDER_REVIEW].includes(violation.status)) {
    throw new ApiError(400, 'Only unresolved violations can be dismissed');
  }

  const policy = getViolationPenaltyPolicy(violation.violation_type, violation.severity);

  return {
    violation: await violationRepository.updateById(id, {
      status: VIOLATION_STATUS.DISMISSED,
      decision: payload.decision,
      penalty: null,
      decision_scope: hasRole(req, ROLE_NAMES.ADMIN)
        ? DECISION_SCOPE.ADMIN_DISMISSAL
        : DECISION_SCOPE.REFEREE_DISMISSAL,
      decided_by: req.user._id,
      decided_at: new Date(),
      penalty_source: hasRole(req, ROLE_NAMES.ADMIN) ? 'manual_admin' : 'policy_confirm',
      policy_version: policy.policy_version
    }),
    policy: policy
  };
}

function getViolationOptions() {
  return {
    violation_types: Object.values(VIOLATION_TYPE),
    severities: Object.values(VIOLATION_SEVERITY),
    statuses: Object.values(VIOLATION_STATUS),
    penalty_types: Object.values(PENALTY_TYPE),
    penalty_policies: getAllViolationPenaltyPolicies()
  };
}

function previewPenalty(payload) {
  return {
    policy: getViolationPenaltyPolicy(payload.violation_type, payload.severity)
  };
}

module.exports = {
  confirmViolation,
  createViolation,
  dismissViolation,
  getViolationOptions,
  listViolations,
  getViolation,
  previewPenalty,
  updateViolation,
  _private: {
    isRefereeProposalWithinBounds,
    penaltiesMatch,
    plainPenalty
  }
};
