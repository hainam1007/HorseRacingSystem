'use strict';

const { isDeepStrictEqual } = require('node:util');

const ApiError = require('../utils/ApiError');
const racetrackRepository = require('../repositories/racetrackRepository');
const { RACETRACK_STATUSES } = require('../validators/racetrackValidator');

function actorId(actor) {
    return actor && (actor._id || actor.id) ? (actor._id || actor.id) : null;
}

function normalizeListStatus(query) {
    const value = query && query.status !== undefined ? String(query.status).trim().toLowerCase() : 'active';
    if (value === 'all' || RACETRACK_STATUSES.includes(value)) return value;
    throw new ApiError(400, 'status must be one of: all, ' + RACETRACK_STATUSES.join(', '));
}

function isUniqueViolation(error) {
    return error && (error.name === 'SequelizeUniqueConstraintError' || error.code === '23505');
}

async function listRacetracks(query) {
    const status = normalizeListStatus(query);
    const racetracks = await racetrackRepository.findAll({ status });
    return { racetracks };
}

async function getRacetrack(id) {
    const racetrack = await racetrackRepository.findById(id);
    if (!racetrack) throw new ApiError(404, 'Racetrack not found');
    return { racetrack };
}

async function createRacetrack(payload, actor) {
    const existing = await racetrackRepository.findByCode(payload.code);
    if (existing) {
        throw new ApiError(409, 'A racetrack with this code already exists');
    }

    try {
        const racetrack = await racetrackRepository.create({
            ...payload,
            created_by: actorId(actor),
            updated_by: actorId(actor)
        });
        return { racetrack };
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new ApiError(409, 'A racetrack with this code already exists');
        }
        throw error;
    }
}

async function updateRacetrack(id, payload, actor) {
    const existing = await racetrackRepository.findById(id);
    if (!existing) throw new ApiError(404, 'Racetrack not found');

    if (payload.code && payload.code !== existing.code) {
        const linkedRaceCount = await racetrackRepository.countRaces(id);
        if (linkedRaceCount > 0) {
            throw new ApiError(409, 'Racetrack code cannot be changed after it has been used by a race');
        }
    }

    const update = { ...payload, updated_by: actorId(actor) };
    if (payload.eligibility_rule && !isDeepStrictEqual(payload.eligibility_rule, existing.eligibility_rule)) {
        update.rule_version = Number(existing.rule_version || 1) + 1;
    }

    try {
        const racetrack = await racetrackRepository.updateById(id, update);
        if (!racetrack) throw new ApiError(404, 'Racetrack not found');
        return { racetrack };
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new ApiError(409, 'A racetrack with this code already exists');
        }
        throw error;
    }
}

async function archiveRacetrack(id, actor) {
    const existing = await racetrackRepository.findById(id);
    if (!existing) throw new ApiError(404, 'Racetrack not found');

    const racetrack = await racetrackRepository.updateById(id, {
        status: 'inactive',
        updated_by: actorId(actor)
    });

    return { racetrack };
}

module.exports = {
    listRacetracks,
    getRacetrack,
    createRacetrack,
    updateRacetrack,
    archiveRacetrack
};
