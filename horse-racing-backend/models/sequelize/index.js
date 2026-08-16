'use strict';

/**
 * Sequelize models loader.
 *
 * Loads every model file in this folder (exporting a
 * `(sequelize, DataTypes) => Sequelize.Model` factory), then resolves
 * cross-model associations declared via `Model.associate(models)`.
 *
 * The loader builds two views of the same model set:
 *   - models.lowercase_table_name   (matches Postgres table_name)
 *   - models.PascalCaseName         (preferred for app code)
 *
 * This keeps the on-disk file / table names identical to the DDL while
 * letting associations and app code use a clean PascalCase identifier.
 *
 * Example:
 *   const { loadSequelizeModels } = require('./models/sequelize');
 *   const { models } = loadSequelizeModels();
 *   await models.User.findAll();                    // PascalCase
 *   await models.users.findAll();                   // table alias
 *   models.bets.belongsTo(models.User, { foreignKey: 'race_id', as: 'race' });
 *   models.Bet.belongsTo(models.User, { foreignKey: 'race_id', as: 'race' });
 */

const fs = require('fs');
const path = require('path');
const { DataTypes } = require('sequelize');
const { getSequelize } = require('../../config/sequelize');

let cache = null;

function toPascalCase(name) {
    return String(name)
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

// Convert a snake_case table name to its singular PascalCase form
// (used for associations that already speak singular names).
const IRREGULAR_PLURALS = {
    horses: 'horse' // singular "horse" (not "horse" + drop s -> "hors")
};

function toPascalSingular(name) {
    if (IRREGULAR_PLURALS[name]) {
        return toPascalCase(IRREGULAR_PLURALS[name]);
    }

    let p = toPascalCase(name);
    if (p.endsWith('ies')) p = p.slice(0, -3) + 'y';
    else if (p.endsWith('sses')) p = p.slice(0, -2);          // classes, processes
    else if (p.endsWith('ses') || p.endsWith('xes') || p.endsWith('shes') || p.endsWith('ches')) p = p.slice(0, -2);
    else if (p.endsWith('s') && !p.endsWith('ss') && !p.endsWith('us')) p = p.slice(0, -1);
    return p;
}

function loadSequelizeModels() {
    if (cache) return cache;

    const sequelize = getSequelize();
    const models = {};
    const here = __dirname;

    const files = fs.readdirSync(here)
        .filter((f) => f.endsWith('.js'))
        .filter((f) => f !== 'index.js' && f !== 'load-test.js' && !f.startsWith('_'));

    for (const file of files) {
        const fullPath = path.join(here, file);
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const define = require(fullPath);
        if (typeof define !== 'function') {
            throw new Error(`Model file ${file} did not export a (sequelize, DataTypes) => Model function.`);
        }
        const model = define(sequelize, DataTypes);
        if (!model || !model.tableName) {
            throw new Error(`Model file ${file} did not return a valid Sequelize model.`);
        }

        const aliasName = toPascalCase(model.tableName);
        const singularName = toPascalSingular(model.tableName);

        models[model.tableName] = model;
        models[aliasName] = model;
        models[singularName] = model;

        model._sequelizeAlias = aliasName;
    }

    // Pass the merged view so any identifier — PascalCase or table_name — resolves.
    for (const key of Object.keys(models)) {
        const m = models[key];
        if (typeof m.associate === 'function' && !m._associationsResolved) {
            try {
                m.associate(models);
            } catch (err) {
                console.error(`[loader] ✖ ${m.tableName}.associate threw: ${err.message}`);
                throw err;
            }
            m._associationsResolved = true;
        }
    }

    cache = { sequelize, models };
    return cache;
}

module.exports = {
    loadSequelizeModels,
    get sequelize() { return loadSequelizeModels().sequelize; },
    get models() { return loadSequelizeModels().models; }
};