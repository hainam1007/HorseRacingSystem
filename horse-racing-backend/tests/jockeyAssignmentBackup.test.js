const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_TYPE,
} = require("../constants/statuses");

const rootDir = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("assignment constants include backup standby lifecycle", () => {
  assert.equal(ASSIGNMENT_TYPE.PRIMARY, "primary");
  assert.equal(ASSIGNMENT_TYPE.BACKUP, "backup");
  assert.equal(ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION, "standby_terms_pending_confirmation");
  assert.equal(ASSIGNMENT_STATUS.STANDBY_CONFIRMED, "standby_confirmed");
  assert.equal(ASSIGNMENT_STATUS.REPLACED, "replaced");
});

test("jockey assignment create flow protects primary and backup rules", () => {
  const source = readProjectFile("services/jockeyAssignmentService.js");

  assert.match(source, /assignment_type:\s*ASSIGNMENT_TYPE\.PRIMARY/);
  assert.match(source, /An accepted primary jockey without a pending cancellation is required before inviting a backup jockey/);
  assert.match(source, /This horse already has an active backup jockey assignment for the selected race/);
  assert.match(source, /assignmentType === ASSIGNMENT_TYPE\.BACKUP \? 1 : undefined/);
  assert.match(source, /This jockey already has an active assignment for the selected horse and race/);
});

test("schema allows only one active backup assignment per horse and race", () => {
  const backupIndex = require("../models/JockeyAssignment").schema.indexes().find(([, options]) => {
    return options.name === "one_active_backup_assignment_per_horse_race_v2";
  });

  assert.ok(backupIndex);
  assert.equal(backupIndex[1].unique, true);
  assert.equal(backupIndex[1].partialFilterExpression.assignment_type, "backup");
});

test("owner cancellation is limited to pending jockey invitations", () => {
  const source = readProjectFile("services/jockeyAssignmentService.js");

  assert.match(source, /Only pending jockey invitations can be cancelled/);
  assert.match(source, /\['pending', ASSIGNMENT_STATUS\.MEETING_INVITED\]\.includes\(assignment\.status\)/);
  assert.match(source, /status: ASSIGNMENT_STATUS\.CANCELLED/);
});

test("promote backup preserves standby audit data and requires new primary terms confirmation", () => {
  const source = readProjectFile("services/jockeyAssignmentService.js");

  assert.match(source, /standby_terms/);
  assert.match(source, /standby_contract/);
  assert.match(source, /status:\s*ASSIGNMENT_STATUS\.MEETING_ACCEPTED/);
  assert.match(source, /TERMS_PENDING_CONFIRMATION/);
  assert.match(source, /previous_primary_assignment_id/);
  assert.match(source, /session\.withTransaction/);
  assert.match(source, /The active primary assignment must end before promoting a backup jockey/);
  assert.match(source, /ASSIGNMENT_STATUS\.STANDBY_CONFIRMED/);
  assert.match(source, /Only confirmed standby assignments can be promoted/);
});

test("backup confirms standby terms without uploading a riding contract", () => {
  const source = readProjectFile("services/jockeyAssignmentService.js");

  assert.match(source, /ASSIGNMENT_STATUS\.STANDBY_TERMS_PENDING_CONFIRMATION/);
  assert.match(source, /ASSIGNMENT_STATUS\.STANDBY_CONFIRMED/);
  assert.match(source, /Backup jockeys confirm standby terms and do not upload a riding contract/);
});

test("backup migration maps legacy accepted assignments without deleting audit documents", () => {
  const source = readProjectFile("scripts/migrateJockeyAssignmentBackupIndexes.js");

  assert.match(source, /status: \{ \$in: \['terms_agreed', 'contract_uploaded', 'accepted'\] \}/);
  assert.match(source, /status: 'standby_confirmed'/);
  assert.match(source, /\$mergeObjects: \['\$terms', '\$standby_terms'\]/);
  assert.match(source, /\$mergeObjects: \['\$contract', '\$standby_contract'\]/);
  assert.match(source, /one_active_primary_assignment_per_horse_race_v2/);
  assert.match(source, /one_active_backup_assignment_per_horse_race_v2/);
  assert.doesNotMatch(source, /dropIndexIfExists\(collection, 'one_active_backup_assignment_per_horse_race'\)/);
  assert.doesNotMatch(source, /dropIndexIfExists\(collection, 'one_active_primary_assignment_per_horse_race'\)/);
  assert.match(source, /\{ status: 'pending' \}/);
  assert.match(source, /\{ status: 'rejected' \}/);
});

test("race execution uses only accepted primary jockey assignments", () => {
  const raceEngineSource = readProjectFile("services/raceEngineService.js");
  const raceServiceSource = readProjectFile("services/raceService.js");
  const refereeServiceSource = readProjectFile("services/refereeService.js");
  const jockeyServiceSource = readProjectFile("services/jockeyService.js");

  assert.match(raceEngineSource, /assignment_type:\s*"primary"/);
  assert.match(raceEngineSource, /status:\s*ASSIGNMENT_STATUS\.ACCEPTED/);
  assert.match(raceServiceSource, /assignment_type:\s*'primary'/);
  assert.match(raceServiceSource, /status:\s*ASSIGNMENT_STATUS\.ACCEPTED/);
  assert.match(refereeServiceSource, /ASSIGNMENT_TYPE\.PRIMARY/);
  assert.match(refereeServiceSource, /status:\s*ASSIGNMENT_STATUS\.ACCEPTED/);
  assert.match(jockeyServiceSource, /ASSIGNMENT_TYPE\.PRIMARY/);
  assert.match(jockeyServiceSource, /status:\s*ASSIGNMENT_STATUS\.ACCEPTED/);
});
