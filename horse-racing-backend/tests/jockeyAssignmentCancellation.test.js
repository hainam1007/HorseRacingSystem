const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  ASSIGNMENT_CANCELLATION_PARTY,
  ASSIGNMENT_CANCELLATION_STATUS
} = require('../constants/statuses');
const {
  validateWithdrawal,
  validateCancellationRequest,
  validateCancellationResponse
} = require('../validators/jockeyAssignmentValidator');
const JockeyAssignment = require('../models/JockeyAssignment');

const rootDir = path.resolve(__dirname, '..');

function runValidator(validator, body) {
  const req = { body };
  let error;

  validator(req, {}, function next(nextError) {
    error = nextError;
  });

  return { req, error };
}

test('cancellation constants and model preserve mutual-decision audit data', () => {
  assert.equal(ASSIGNMENT_CANCELLATION_STATUS.PENDING, 'pending');
  assert.equal(ASSIGNMENT_CANCELLATION_STATUS.APPROVED, 'approved');
  assert.equal(ASSIGNMENT_CANCELLATION_STATUS.REJECTED, 'rejected');
  assert.equal(ASSIGNMENT_CANCELLATION_PARTY.HORSE_OWNER, 'horse_owner');
  assert.equal(ASSIGNMENT_CANCELLATION_PARTY.JOCKEY, 'jockey');

  const cancellationPath = JockeyAssignment.schema.path('cancellation_request.status');
  assert.deepEqual(cancellationPath.enumValues, ['pending', 'approved', 'rejected']);
  assert.ok(JockeyAssignment.schema.path('cancellation_request.initiated_by'));
  assert.ok(JockeyAssignment.schema.path('cancellation_request.responded_by'));
});

test('cancellation request validator requires a bounded reason', () => {
  const missing = runValidator(validateCancellationRequest, {});
  assert.equal(missing.error.statusCode, 400);
  assert.match(missing.error.message, /Validation failed/);

  const valid = runValidator(validateCancellationRequest, { reason: 'Schedule conflict' });
  assert.equal(valid.error, undefined);
  assert.deepEqual(valid.req.validatedBody, { reason: 'Schedule conflict' });
});

test('withdrawal validator and model preserve unilateral withdrawal audit data', () => {
  const missing = runValidator(validateWithdrawal, {});
  assert.equal(missing.error.statusCode, 400);

  const valid = runValidator(validateWithdrawal, { reason: 'Negotiation did not reach final agreement' });
  assert.equal(valid.error, undefined);
  assert.deepEqual(valid.req.validatedBody, {
    reason: 'Negotiation did not reach final agreement'
  });

  assert.ok(JockeyAssignment.schema.path('withdrawal.initiated_by_party'));
  assert.ok(JockeyAssignment.schema.path('withdrawal.initiated_by'));
  assert.ok(JockeyAssignment.schema.path('withdrawal.reason'));
  assert.ok(JockeyAssignment.schema.path('withdrawal.withdrawn_at'));
});

test('cancellation response validator only accepts approve or reject', () => {
  const invalid = runValidator(validateCancellationResponse, { decision: 'cancel' });
  assert.equal(invalid.error.statusCode, 400);

  const valid = runValidator(validateCancellationResponse, {
    decision: 'APPROVE',
    response_message: 'Agreed by both parties'
  });
  assert.equal(valid.error, undefined);
  assert.deepEqual(valid.req.validatedBody, {
    decision: 'approve',
    response_message: 'Agreed by both parties'
  });
});

test('service separates pre-agreement withdrawal from mutual cancellation', () => {
  const source = fs.readFileSync(
    path.join(rootDir, 'services/jockeyAssignmentService.js'),
    'utf8'
  );

  assert.match(source, /WITHDRAWABLE_ASSIGNMENT_STATUSES/);
  assert.match(source, /isBindingAssignment\(assignment\)/);
  assert.match(source, /confirmed standby agreement/);
  assert.doesNotMatch(source, /Mutual cancellation currently applies only to primary/);
  assert.match(source, /initiated_by_party === actor\.party/);
  assert.match(source, /payload\.decision === 'approve'/);
  assert.match(source, /update\.status = ASSIGNMENT_STATUS\.CANCELLED/);
  assert.match(source, /cannot be changed after the race has started/);
  assert.match(source, /active primary assignment must end before promoting a backup jockey/);
  assert.match(source, /Resolve the backup cancellation request before promotion/);
  assert.match(source, /already binding; both parties must use mutual cancellation/);
  assert.match(source, /mutateAssignmentWhileRaceOpen/);
  assert.match(source, /Race\.findOneAndUpdate/);
  assert.match(source, /\$inc: \{ assignment_revision: 1 \}/);
  assert.match(source, /jockeyAssignmentRepository\.create\([\s\S]*session\)/);
  assert.match(source, /status: assignment\.status/);
  assert.match(source, /changed before your terms response was saved/);
  assert.match(source, /changed before your contract response was saved/);
});
