const assert = require('node:assert/strict');
const test = require('node:test');
const { Op } = require('sequelize');

const { ROLE_NAMES } = require('../constants/roles');
const {
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  PENALTY_TYPE,
  VIOLATION_SEVERITY,
  VIOLATION_STATUS,
  VIOLATION_TYPE
} = require('../constants/statuses');
const { getViolationPenaltyPolicy } = require('../constants/violationPenaltyPolicy');
const { Horse } = require('../models');
const horseCheckRepository = require('../repositories/horseCheckRepository');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const raceResultRepository = require('../repositories/raceResultRepository');
const violationRepository = require('../repositories/violationRepository');
const horseCheckService = require('../services/horseCheckService');
const violationService = require('../services/violationService');
const { validateConfirmViolation } = require('../validators/violationValidator');
const { newObjectId } = require('../utils/objectId');

const VIOLATION_ID = newObjectId();
const RACE_ID = newObjectId();
const REFEREE_ID = newObjectId();
const REFEREE_USER_ID = newObjectId();
const HORSE_ID = newObjectId();

async function withPatches(patches, callback) {
  const originals = patches.map(function(patch) {
    return patch.target[patch.key];
  });

  patches.forEach(function(patch) {
    patch.target[patch.key] = patch.value;
  });

  try {
    return await callback();
  } finally {
    patches.forEach(function(patch, index) {
      patch.target[patch.key] = originals[index];
    });
  }
}

function makeViolation(overrides) {
  const policy = getViolationPenaltyPolicy(
    VIOLATION_TYPE.LANE_VIOLATION,
    VIOLATION_SEVERITY.MAJOR
  );

  return Object.assign({
    _id: VIOLATION_ID,
    race_id: RACE_ID,
    referee_id: REFEREE_ID,
    violation_type: VIOLATION_TYPE.LANE_VIOLATION,
    severity: VIOLATION_SEVERITY.MAJOR,
    status: VIOLATION_STATUS.RECORDED,
    suggested_penalty: policy.suggested_penalty,
    policy_version: policy.policy_version
  }, overrides);
}

async function confirmAsReferee(violation, payload) {
  let updateData;
  const result = await withPatches([
    {
      target: violationRepository,
      key: 'findById',
      value: async function() {
        return violation;
      }
    },
    {
      target: violationRepository,
      key: 'updateById',
      value: async function(id, data) {
        updateData = data;
        return Object.assign({}, violation, data);
      }
    },
    {
      target: raceResultRepository,
      key: 'find',
      value: async function() {
        return [];
      }
    },
    {
      target: profileRepository,
      key: 'findRaceRefereeByUserId',
      value: async function() {
        return { _id: REFEREE_ID };
      }
    }
  ], function() {
    return violationService.confirmViolation({
      roles: [ROLE_NAMES.RACE_REFEREE],
      user: { _id: REFEREE_USER_ID }
    }, violation._id, payload);
  });

  return { result: result, updateData: updateData };
}

async function dismissAsReferee(violation, payload) {
  let updateData;
  const result = await withPatches([
    {
      target: violationRepository,
      key: 'findById',
      value: async function() {
        return violation;
      }
    },
    {
      target: violationRepository,
      key: 'updateById',
      value: async function(id, data) {
        updateData = data;
        return Object.assign({}, violation, data);
      }
    },
    {
      target: raceResultRepository,
      key: 'find',
      value: async function() {
        return [];
      }
    },
    {
      target: profileRepository,
      key: 'findRaceRefereeByUserId',
      value: async function() {
        return { _id: REFEREE_ID };
      }
    }
  ], function() {
    return violationService.dismissViolation({
      roles: [ROLE_NAMES.RACE_REFEREE],
      user: { _id: REFEREE_USER_ID }
    }, violation._id, payload);
  });

  return { result: result, updateData: updateData };
}

test('creation snapshots policy and ignores auto confirmation', async function() {
  let createData;
  let lockedResultFilter;
  const result = await withPatches([
    {
      target: raceRepository,
      key: 'findById',
      value: async function() {
        return { _id: RACE_ID, referee_id: REFEREE_ID };
      }
    },
    {
      target: raceResultRepository,
      key: 'find',
      value: async function(filter) {
        lockedResultFilter = filter;
        return [];
      }
    },
    {
      target: profileRepository,
      key: 'findRaceRefereeByUserId',
      value: async function() {
        return { _id: REFEREE_ID };
      }
    },
    {
      target: violationRepository,
      key: 'create',
      value: async function(data) {
        createData = data;
        return data;
      }
    }
  ], function() {
    return violationService.createViolation({
      roles: [ROLE_NAMES.RACE_REFEREE],
      user: { _id: REFEREE_USER_ID }
    }, {
      race_id: RACE_ID,
      violation_type: VIOLATION_TYPE.LANE_VIOLATION,
      severity: VIOLATION_SEVERITY.MAJOR,
      status: VIOLATION_STATUS.RECORDED,
      evidence_files: [],
      auto_confirm: true
    });
  });

  assert.equal(result.auto_confirmed, false);
  assert.deepEqual(lockedResultFilter[Op.or][0].status[Op.in], ['confirmed', 'published']);
  assert.equal(lockedResultFilter[Op.or][1].submitted_to_admin_at[Op.ne], null);
  assert.equal(createData.status, VIOLATION_STATUS.RECORDED);
  assert.equal(createData.suggested_penalty.time_penalty_seconds, 3);
  assert.equal(createData.penalty, undefined);
  assert.equal(createData.auto_confirm, undefined);
});

test('during-race horse check never auto-confirms its linked violation', async function() {
  let violationData;
  let lockedResultFilter;
  const result = await withPatches([
    {
      target: raceRepository,
      key: 'findById',
      value: async function() {
        return { _id: RACE_ID, referee_id: REFEREE_ID };
      }
    },
    {
      target: Horse,
      key: 'findByPk',
      value: async function() {
        return { _id: HORSE_ID };
      }
    },
    {
      target: profileRepository,
      key: 'findRaceRefereeByUserId',
      value: async function() {
        return { _id: REFEREE_ID };
      }
    },
    {
      target: raceResultRepository,
      key: 'find',
      value: async function(filter) {
        lockedResultFilter = filter;
        return [];
      }
    },
    {
      target: horseCheckRepository,
      key: 'findOne',
      value: async function() {
        return {
          status: HORSE_CHECK_STATUS.PASSED,
          is_eligible: true
        };
      }
    },
    {
      target: horseCheckRepository,
      key: 'create',
      value: async function(data) {
        return Object.assign({ _id: 'check-1' }, data);
      }
    },
    {
      target: horseCheckRepository,
      key: 'updateById',
      value: async function(id, data) {
        return Object.assign({ _id: id }, data);
      }
    },
    {
      target: violationRepository,
      key: 'create',
      value: async function(data) {
        violationData = data;
        return Object.assign({ _id: VIOLATION_ID }, data);
      }
    }
  ], function() {
    return horseCheckService.createHorseCheck({
      roles: [ROLE_NAMES.RACE_REFEREE],
      user: { _id: REFEREE_USER_ID }
    }, {
      race_id: RACE_ID,
      horse_id: HORSE_ID,
      phase: HORSE_CHECK_PHASE.DURING_RACE,
      status: HORSE_CHECK_STATUS.INCIDENT_RECORDED,
      event_type: VIOLATION_TYPE.LANE_VIOLATION,
      severity: VIOLATION_SEVERITY.MAJOR,
      requires_violation: true,
      auto_confirm_violation: true
    });
  });

  assert.equal(result.auto_confirmed, false);
  assert.deepEqual(lockedResultFilter.status[Op.in], ['confirmed', 'published']);
  assert.equal(lockedResultFilter.status.$in, undefined);
  assert.equal(violationData.status, VIOLATION_STATUS.RECORDED);
  assert.equal(violationData.suggested_penalty.time_penalty_seconds, 3);
  assert.equal(violationData.penalty, undefined);
});

test('referee policy match confirms without deviation reason', async function() {
  const violation = makeViolation();
  const confirmed = await confirmAsReferee(violation, {
    decision: 'Confirmed after reviewing the incident'
  });

  assert.equal(confirmed.result.requires_admin_review, false);
  assert.equal(confirmed.updateData.status, VIOLATION_STATUS.CONFIRMED);
  assert.equal(confirmed.updateData.deviates_from_policy, false);
  assert.equal(confirmed.updateData.proposed_penalty.time_penalty_seconds, 3);
  assert.equal(confirmed.updateData.penalty.time_penalty_seconds, 3);
});

test('referee adjustment requires a reason', async function() {
  const violation = makeViolation();

  await assert.rejects(
    confirmAsReferee(violation, {
      decision: 'Reduce the time penalty',
      penalty: {
        type: PENALTY_TYPE.TIME_PENALTY,
        time_penalty_seconds: 2
      }
    }),
    function(error) {
      return error.statusCode === 400 && /deviation_reason/.test(error.message);
    }
  );
});

test('in-bounds referee adjustment is confirmed', async function() {
  const confirmed = await confirmAsReferee(makeViolation(), {
    decision: 'Reduced after video review',
    deviation_reason: 'The horse was forced outward by another runner',
    penalty: {
      type: PENALTY_TYPE.TIME_PENALTY,
      time_penalty_seconds: 2
    }
  });

  assert.equal(confirmed.result.requires_admin_review, false);
  assert.equal(confirmed.updateData.status, VIOLATION_STATUS.CONFIRMED);
  assert.equal(confirmed.updateData.deviates_from_policy, true);
  assert.equal(confirmed.updateData.penalty.time_penalty_seconds, 2);
  assert.equal(confirmed.updateData.penalty_source, 'referee_adjustment');
});

test('out-of-bounds referee proposal is rejected', async function() {
  await assert.rejects(
    confirmAsReferee(makeViolation(), {
      decision: 'Request stronger sanction',
      deviation_reason: 'Repeated dangerous lane changes were observed',
      penalty: {
        type: PENALTY_TYPE.TIME_PENALTY,
        time_penalty_seconds: 9
      }
    }),
    function(error) {
      return error.statusCode === 400 && /outside the allowed range/.test(error.message);
    }
  );
});

test('referee confirms a sensitive violation without admin review', async function() {
  const policy = getViolationPenaltyPolicy(
    VIOLATION_TYPE.HORSE_ABUSE,
    VIOLATION_SEVERITY.MAJOR
  );
  const violation = makeViolation({
    violation_type: VIOLATION_TYPE.HORSE_ABUSE,
    severity: VIOLATION_SEVERITY.MAJOR,
    status: VIOLATION_STATUS.UNDER_REVIEW,
    suggested_penalty: policy.suggested_penalty,
    policy_version: policy.policy_version
  });
  const confirmed = await confirmAsReferee(violation, {
    decision: 'Confirm welfare incident after evidence review'
  });

  assert.equal(confirmed.result.requires_admin_review, false);
  assert.equal(confirmed.updateData.status, VIOLATION_STATUS.CONFIRMED);
  assert.equal(confirmed.updateData.penalty.type, PENALTY_TYPE.DISQUALIFICATION);
  assert.equal(confirmed.updateData.penalty.suspension_days, 14);
});

test('referee can dismiss a sensitive violation', async function() {
  const policy = getViolationPenaltyPolicy(
    VIOLATION_TYPE.DOPING_SUSPECTED,
    VIOLATION_SEVERITY.CRITICAL
  );
  const dismissed = await dismissAsReferee(makeViolation({
    violation_type: VIOLATION_TYPE.DOPING_SUSPECTED,
    severity: VIOLATION_SEVERITY.CRITICAL,
    status: VIOLATION_STATUS.UNDER_REVIEW,
    suggested_penalty: policy.suggested_penalty
  }), {
    decision: 'Laboratory review found no prohibited substance'
  });

  assert.equal(dismissed.updateData.status, VIOLATION_STATUS.DISMISSED);
  assert.equal(dismissed.updateData.penalty, null);
  assert.equal(dismissed.updateData.decision_scope, 'referee_dismissal');
});

test('admin override requires a deviation reason', async function() {
  const violation = makeViolation();

  await withPatches([
    {
      target: violationRepository,
      key: 'findById',
      value: async function() {
        return violation;
      }
    },
    {
      target: raceResultRepository,
      key: 'find',
      value: async function() {
        return [];
      }
    }
  ], async function() {
    await assert.rejects(
      violationService.confirmViolation({
        roles: [ROLE_NAMES.ADMIN],
        user: { _id: 'admin-user-1' }
      }, violation._id, {
        decision: 'Override policy',
        penalty: {
          type: PENALTY_TYPE.TIME_PENALTY,
          time_penalty_seconds: 2
        }
      }),
      function(error) {
        return error.statusCode === 400 && /deviation_reason/.test(error.message);
      }
    );
  });
});

test('admin can approve an unresolved referee proposal with its recorded reason', async function() {
  const violation = makeViolation({
    status: VIOLATION_STATUS.UNDER_REVIEW,
    proposed_penalty: {
      type: PENALTY_TYPE.TIME_PENALTY,
      time_penalty_seconds: 9
    },
    deviates_from_policy: true,
    deviation_reason: 'Repeated lane violations require a stronger sanction',
    proposed_by: REFEREE_USER_ID,
    proposed_at: new Date()
  });
  let updateData;
  const result = await withPatches([
    {
      target: violationRepository,
      key: 'findById',
      value: async function() {
        return violation;
      }
    },
    {
      target: violationRepository,
      key: 'updateById',
      value: async function(id, data) {
        updateData = data;
        return Object.assign({}, violation, data);
      }
    },
    {
      target: raceResultRepository,
      key: 'find',
      value: async function() {
        return [];
      }
    }
  ], function() {
    return violationService.confirmViolation({
      roles: [ROLE_NAMES.ADMIN],
      user: { _id: 'admin-user-1' }
    }, violation._id, {
      decision: 'Approve referee proposal'
    });
  });

  assert.equal(result.requires_admin_review, false);
  assert.equal(updateData.status, VIOLATION_STATUS.CONFIRMED);
  assert.equal(updateData.penalty.time_penalty_seconds, 9);
  assert.equal(updateData.deviation_reason, violation.deviation_reason);
  assert.equal(updateData.decision_scope, 'admin_approval');
});

test('confirm validator preserves penalty and deviation reason', function() {
  const req = {
    body: {
      decision: 'Adjusted after review',
      deviation_reason: 'Mitigating interference',
      penalty: {
        type: PENALTY_TYPE.TIME_PENALTY,
        time_penalty_seconds: 2
      }
    }
  };
  let error;

  validateConfirmViolation(req, {}, function(nextError) {
    error = nextError;
  });

  assert.equal(error, undefined);
  assert.equal(req.validatedBody.deviation_reason, 'Mitigating interference');
  assert.equal(req.validatedBody.penalty.time_penalty_seconds, 2);
});
