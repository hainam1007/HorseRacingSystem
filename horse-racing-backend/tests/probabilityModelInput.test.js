const assert = require('node:assert/strict');
const test = require('node:test');

const probabilityFeatureBuilderService = require('../services/probabilityFeatureBuilderService');

test('kilogramsToPounds converts app weight to the model unit', () => {
  assert.equal(probabilityFeatureBuilderService._private.kilogramsToPounds(54.5), 120.15);
  assert.equal(probabilityFeatureBuilderService._private.kilogramsToPounds(50), 110.23);
});
