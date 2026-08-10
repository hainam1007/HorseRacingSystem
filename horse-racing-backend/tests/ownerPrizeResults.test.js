const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('owner prize result feed exposes race result penalty details', () => {
  const repositorySource = readProjectFile('repositories/prizeRepository.js');

  assert.match(repositorySource, /path:\s*'applied_violation_ids'/);
  assert.match(repositorySource, /path:\s*'race_result_id'/);
  assert.match(repositorySource, /path:\s*'tournament_id'/);
  assert.match(repositorySource, /path:\s*'round_id'/);
});

test('owner frontend reads prize awards instead of placeholder result copy', (t) => {
  const frontendReferenceRoot = path.join(projectRoot, '_reference', 'Horse-Riding-Management-System');

  if (!fs.existsSync(frontendReferenceRoot)) {
    t.skip('frontend reference project is not checked out in this workspace');
    return;
  }

  const ownerApiSource = readProjectFile('_reference/Horse-Riding-Management-System/src/api/ownerApi.js');
  const ownerDataSource = readProjectFile('_reference/Horse-Riding-Management-System/src/pages/owner/useOwnerData.js');
  const ownerPageSource = readProjectFile('_reference/Horse-Riding-Management-System/src/pages/owner/OwnerPages.jsx');

  assert.match(ownerApiSource, /getPrizeAwards/);
  assert.match(ownerApiSource, /apiRequest\(`\/prizes/);
  assert.match(ownerDataSource, /useOwnerPrizeAwards/);
  assert.match(ownerPageSource, /useOwnerPrizeAwards/);
  assert.match(ownerPageSource, /Owner prize/);
  assert.match(ownerPageSource, /Penalty/);
  assert.doesNotMatch(ownerPageSource, /Owner results need a backend contract/);
});
