'use strict';

const crypto = require('node:crypto');

/**
 * Generate a random UUID v4 string.
 *
 * Stand-in for the legacy `new ObjectId().toString()` helper — Postgres
 * primary keys are UUIDs, so tests that previously minted fake id values
 * can mint a UUID instead and the rest of the assertion path keeps working
 * unchanged.
 *
 * @returns {string}
 */
function newObjectId() {
  return crypto.randomUUID();
}

module.exports = { newObjectId };