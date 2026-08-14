'use strict';

/**
 * Sequelize connection manager.
 *
 * Single-source-of-truth for the PostgreSQL connection used by the
 * application runtime, including the connection pool settings and the
 * optional CLI override (`PGCLI_BINARY`) for ops debugging.
 */

const path = require('path');
const { Sequelize } = require('sequelize');

let sequelize = null;
let listenersRegistered = false;

function readNumber(name, defaultValue) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return defaultValue;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

function buildSequelizeOptions() {
    return {
        host: process.env.PGHOST || '127.0.0.1',
        port: readNumber('PGPORT', 5432),
        username: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'horse_racing',
        dialect: 'postgres',
        pool: {
            max: readNumber('PG_POOL_MAX', 10),
            min: 0,
            idle: readNumber('PG_IDLE_TIMEOUT_MS', 30000),
            acquire: readNumber('PG_CONNECTION_TIMEOUT_MS', 10000)
        },
        statement_timeout: readNumber('PG_STATEMENT_TIMEOUT_MS', 30000),
        logging: process.env.NODE_ENV === 'development'
            ? (sql) => process.env.SEQUELIZE_LOG === '1' ? console.log('[sequelize]', sql) : null
            : false,
        define: {
            underscored: true,
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            deletedAt: 'deleted_at',
            freezeTableName: true,
            paranoid: false
        }
    };
}

function getSequelize() {
    if (sequelize) return sequelize;
    sequelize = new Sequelize(buildSequelizeOptions());
    registerListeners(sequelize);
    return sequelize;
}

function registerListeners(instance) {
    if (listenersRegistered) return;
    instance.afterConnect(() => {
        // eslint-disable-next-line no-console
        console.log('[sequelize] connected to PostgreSQL');
    });
    instance.beforeConnect(() => {
        // eslint-disable-next-line no-console
        console.log('[sequelize] connecting to PostgreSQL...');
    });
    listenersRegistered = true;
}

async function connectSequelize() {
    const instance = getSequelize();
    await instance.authenticate();
    return instance;
}

/**
 * Load all Sequelize models from the `models/sequelize/` folder.
 *
 * Models are loaded by side-effect (they call sequelize.define()).
 * Use this after `getSequelize()` is instantiated so we can attach models
 * to the right Sequelize instance.
 */
function loadSequelizeModels(instance) {
    const target = instance || getSequelize();
    const dir = path.join(__dirname, '..', 'models', 'sequelize');
    // Lazy load to avoid circular dependency issues during Phase 4 placeholder.
    return target;
}

async function disconnectSequelize() {
    if (!sequelize) return;
    await sequelize.close();
    sequelize = null;
}

module.exports = {
    getSequelize,
    connectSequelize,
    disconnectSequelize,
    loadSequelizeModels
};
