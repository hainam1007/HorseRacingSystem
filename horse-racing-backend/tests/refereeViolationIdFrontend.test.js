const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../horse-racing-frontend/src/Referee/ViolationManagement.jsx'),
  'utf8'
);

test('referee confirmation uses the Sequelize violation id and loaded associations', function() {
  assert.match(source, /const violationId = getId\(selectedViolation\)/);
  assert.match(source, /refereeApi\.confirmViolation\(violationId,/);
  assert.match(source, /refereeApi\.dismissViolation\(violationId,/);
  assert.match(source, /violation\?\.jockey \|\| violation\?\.jockey_id/);
  assert.match(source, /violation\?\.horse \|\| violation\?\.horse_id/);
  assert.doesNotMatch(source, /refereeApi\.confirmViolation\(selectedViolation\._id,/);
});
