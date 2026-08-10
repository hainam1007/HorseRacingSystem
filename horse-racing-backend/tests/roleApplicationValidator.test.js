const assert = require('node:assert/strict');
const test = require('node:test');

const { ROLE_NAMES } = require('../constants/roles');
const { validateCreateApplication } = require('../validators/roleApplicationValidator');

function runValidator(roleName, body) {
  const req = { body: body };
  let error;

  validateCreateApplication(roleName)(req, {}, function(nextError) {
    error = nextError;
  });

  return { error, body: req.validatedBody };
}

test('horse owner role application accepts frontend payload fields', function() {
  const result = runValidator(ROLE_NAMES.HORSE_OWNER, {
    stable_name: 'Whitmore Racing Stables',
    address: 'Newmarket, Suffolk',
    license_number: 'BHA-O-1847',
    ownership_type: 'individual',
    tax_id: 'TAX-1847',
    identity_document_file_data: 'data:application/pdf;base64,identity',
    owner_license_document_file_data: 'data:application/pdf;base64,license',
    horse_ownership_proof_file_data: 'data:application/pdf;base64,proof'
  });

  assert.equal(result.error, undefined);
  assert.equal(result.body.requested_role, ROLE_NAMES.HORSE_OWNER);
  assert.equal(result.body.application_data.ownership_type, 'individual');
  assert.equal(result.body.application_data.owner_license_document_file_data, 'data:application/pdf;base64,license');
});

test('jockey role application accepts required document file data', function() {
  const result = runValidator(ROLE_NAMES.JOCKEY, {
    license_number: 'BHA-J-2401',
    height: 168,
    weight: 54,
    experience_years: 8,
    medical_clearance_file_data: 'data:application/pdf;base64,medical',
    racing_license_document_file_data: 'data:application/pdf;base64,racing',
    riding_certificate_file_data: 'data:application/pdf;base64,certificate',
    identity_document_file_data: 'data:application/pdf;base64,identity'
  });

  assert.equal(result.error, undefined);
  assert.equal(result.body.requested_role, ROLE_NAMES.JOCKEY);
  assert.equal(result.body.application_data.height, 168);
  assert.equal(result.body.application_data.racing_license_document_file_data, 'data:application/pdf;base64,racing');
});

test('race referee role application accepts required document file data', function() {
  const result = runValidator(ROLE_NAMES.RACE_REFEREE, {
    license_number: 'BHA-R-0921',
    experience_years: 16,
    accreditation_body: 'British Horseracing Authority',
    previous_official_role: 'Paddock judge',
    rules_training_certificate_file_data: 'data:application/pdf;base64,rules',
    background_check_file_data: 'data:application/pdf;base64,background',
    identity_document_file_data: 'data:application/pdf;base64,identity'
  });

  assert.equal(result.error, undefined);
  assert.equal(result.body.requested_role, ROLE_NAMES.RACE_REFEREE);
  assert.equal(result.body.application_data.accreditation_body, 'British Horseracing Authority');
  assert.equal(result.body.application_data.background_check_file_data, 'data:application/pdf;base64,background');
});
