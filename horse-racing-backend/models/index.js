'use strict';

/**
 * Compatibility barrel for `require('../models')`.
 *
 * The codebase used to expose the Sequelize models through this file.
 * Consumers are expected to use `loadSequelizeModels()` from
 * `./sequelize/index.js` directly. However, a handful of legacy repository
 * files still use the `require('../models')` import style — so this module
 * re-exports the Sequelize models under the same names they used to have.
 *
 * IMPORTANT: This is a *transitional compatibility shim*. New code should
 * always call `loadSequelizeModels()` instead.
 */

const { loadSequelizeModels } = require('./sequelize/index.js');

let cached = null;

function getModels() {
  if (cached) return cached;
  const { models } = loadSequelizeModels();
  cached = models;
  return cached;
}

// Proxy returns the Sequelize model for the requested PascalCase name.
module.exports = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop === 'symbol') return undefined;
    return getModels()[prop];
  },
  has(_target, prop) {
    if (typeof prop === 'symbol') return false;
    return prop in getModels();
  },
  ownKeys() {
    return Reflect.ownKeys(getModels());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const models = getModels();
    if (!(prop in models)) return undefined;
    return {
      enumerable: true,
      configurable: true,
      value: models[prop],
      writable: false
    };
  }
});
