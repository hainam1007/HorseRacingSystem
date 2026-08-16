'use strict';

/**
 * userRepository — Sequelize/PostgreSQL implementation.
 *
 * The legacy dual-mode wrapper was removed. All callers continue to use the
 * same async function signatures.
 */

module.exports = require('./sequelize/userRepository');