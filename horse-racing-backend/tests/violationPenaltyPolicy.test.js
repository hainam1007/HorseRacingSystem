const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getAllViolationPenaltyPolicies,
  getViolationPenaltyPolicy
} = require('../constants/violationPenaltyPolicy');
const {
  VIOLATION_SEVERITY,
  VIOLATION_TYPE
} = require('../constants/statuses');

test('penalty policy covers every violation and severity combination', function() {
  const policies = getAllViolationPenaltyPolicies();
  const expectedCount = Object.keys(VIOLATION_TYPE).length * Object.keys(VIOLATION_SEVERITY).length;

  assert.equal(policies.length, expectedCount);
  policies.forEach(function(policy) {
    assert.ok(policy.policy_version);
    assert.ok(policy.suggested_penalty.type);
    assert.equal(typeof policy.requires_review, 'boolean');
    assert.equal(typeof policy.referee_adjustment.allowed, 'boolean');
    assert.ok(Array.isArray(policy.referee_adjustment.primary_types));
    assert.equal(typeof policy.referee_adjustment.bounds, 'object');
  });
});

test('major lane violation adds three seconds', function() {
  const policy = getViolationPenaltyPolicy(
    VIOLATION_TYPE.LANE_VIOLATION,
    VIOLATION_SEVERITY.MAJOR
  );

  assert.equal(policy.requires_review, false);
  assert.equal(policy.suggested_penalty.type, 'time_penalty');
  assert.equal(policy.suggested_penalty.time_penalty_seconds, 3);
  assert.equal(policy.referee_adjustment.allowed, true);
  assert.deepEqual(policy.referee_adjustment.primary_types, [
    'warning',
    'score_deduction',
    'time_penalty',
    'position_demotion',
    'disqualification',
    'suspension',
    'fine'
  ]);
  assert.deepEqual(
    policy.referee_adjustment.bounds.time_penalty_seconds,
    { min: 1, max: 5, step: 1 }
  );
});

test('critical dangerous riding disqualifies and suspends jockey', function() {
  const policy = getViolationPenaltyPolicy(
    VIOLATION_TYPE.DANGEROUS_RIDING,
    VIOLATION_SEVERITY.CRITICAL
  );

  assert.equal(policy.suggested_penalty.disqualified, true);
  assert.equal(policy.suggested_penalty.suspension_days, 7);
});

test('referee can decide every violation type', function() {
  [
    VIOLATION_TYPE.HORSE_ABUSE,
    VIOLATION_TYPE.DOPING_SUSPECTED,
    VIOLATION_TYPE.TRACK_SAFETY_ISSUE,
    VIOLATION_TYPE.OTHER
  ].forEach(function(violationType) {
    Object.values(VIOLATION_SEVERITY).forEach(function(severity) {
      const policy = getViolationPenaltyPolicy(violationType, severity);

      assert.equal(policy.requires_review, false);
      assert.equal(policy.referee_adjustment.allowed, true);
      assert.equal(policy.referee_adjustment.primary_types.length, 7);
    });
  });
});

test('returned penalty policies are defensive copies', function() {
  const first = getViolationPenaltyPolicy(VIOLATION_TYPE.INTERFERENCE, VIOLATION_SEVERITY.MAJOR);

  first.suggested_penalty.position_delta = 99;
  first.referee_adjustment.primary_types.push('fine');
  first.referee_adjustment.bounds.position_delta.max = 99;

  const second = getViolationPenaltyPolicy(VIOLATION_TYPE.INTERFERENCE, VIOLATION_SEVERITY.MAJOR);
  assert.equal(second.suggested_penalty.position_delta, 1);
  assert.equal(second.referee_adjustment.primary_types.length, 7);
  assert.equal(second.referee_adjustment.bounds.position_delta.max, 2);
});
