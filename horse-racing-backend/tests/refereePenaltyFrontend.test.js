const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(projectRoot, '_reference', 'Horse-Riding-Management-System');

function readFrontendFile(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

test('referee penalty editor follows system adjustment types, bounds, and steps', (t) => {
  if (!fs.existsSync(frontendRoot)) {
    t.skip('frontend reference project is not checked out in this workspace');
    return;
  }

  const source = readFrontendFile('src/components/PenaltyDecisionEditor.jsx');

  assert.match(source, /adjustment\.primary_types/);
  assert.match(source, /isStepAligned/);
  assert.match(source, /snapToStep/);
  assert.match(source, /disabled=\{optionDisabled\}/);
  assert.match(source, /System recommendation/);
  assert.doesNotMatch(source, /Backend policy/);
});

test('referee violation flow confirms a final decision without review routing', (t) => {
  if (!fs.existsSync(frontendRoot)) {
    t.skip('frontend reference project is not checked out in this workspace');
    return;
  }

  const source = readFrontendFile('src/Referee/ViolationManagement.jsx');

  assert.match(source, /evidence_files:\s*evidenceFiles/);
  assert.match(source, /violation\.proposedPenalty/);
  assert.match(source, /System penalty recommendation/);
  assert.match(source, /Penalty decision confirmed/);
  assert.match(source, /Confirm penalty/);
  assert.match(source, /Dismiss incident/);
  assert.doesNotMatch(source, /requires_admin_review/);
  assert.doesNotMatch(source, /Administrative review required/);
  assert.doesNotMatch(source, /status:\s*policy\?\.requires_review/);
  assert.doesNotMatch(source, /proposed_penalty:\s*penaltyDecision/);
  assert.doesNotMatch(source, /Backend policy preview/);
});

test('administrative incident review shows system recommendation and referee proposal', (t) => {
  if (!fs.existsSync(frontendRoot)) {
    t.skip('frontend reference project is not checked out in this workspace');
    return;
  }

  const source = readFrontendFile('src/Admin/AdminIncidentModule.jsx');

  assert.match(source, /System recommendation:/);
  assert.match(source, /Referee proposal:/);
  assert.match(source, /Administrative decision note/);
  assert.match(source, /deviation_reason:/);
});
