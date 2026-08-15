'use strict';

/**
 * Sequelize-backed horseOwner repository.
 *
 * The legacy version juggled 9 models (HorseOwner, Horse, HorseCheck,
 * Jockey, JockeyAssignment, Race, Registration, Round, Tournament). We
 * mirror the API and rely on Sequelize's eager-loading `include:` for
 * related rows.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');

let _bundle = null;
function bundle() { if (!_bundle) _bundle = loadSequelizeModels(); return _bundle; }
function models() { return bundle().models; }

async function findProfileByUserId(userId) {
    const M = models();
    const row = await M.HorseOwner.findOne({ where: { user_id: userId } });
    return toPlain(row);
}

async function updateProfileById(profileId, updateData) {
    const M = models();
    const fields = require('./adapter').projectUpdate(updateData);
    const [affected] = await M.HorseOwner.update(fields, { where: { id: profileId } });
    if (affected === 0) return null;
    const row = await M.HorseOwner.findByPk(profileId);
    return toPlain(row);
}

async function findHorsesByOwnerId(ownerId) {
    const M = models();
    const rows = await M.Horse.findAll({
        where: { owner_id: ownerId, deleted_at: null },
        order: [['created_at', 'DESC']]
    });
    return rows.map(toPlain);
}

async function createHorse(horseData) {
    const M = models();
    const row = await M.Horse.create(horseData);
    return toPlain(row);
}

async function findHorseById(horseId) {
    const M = models();
    const row = await M.Horse.findOne({ where: { id: horseId, deleted_at: null } });
    return toPlain(row);
}

async function updateHorseById(horseId, updateData) {
    const M = models();
    const fields = require('./adapter').projectUpdate(updateData);
    const [affected] = await M.Horse.update(fields, { where: { id: horseId } });
    if (affected === 0) return null;
    return findHorseById(horseId);
}

async function findHorseChecksByHorseId(horseId) {
    const M = models();
    const rows = await M.HorseCheck.findAll({
        where: { horse_id: horseId },
        order: [['checked_at', 'DESC']]
    });
    return rows.map(toPlain);
}

async function findRegistrationsByHorseId(horseId) {
    const M = models();
    const rows = await M.Registration.findAll({
        where: { horse_id: horseId },
        order: [['registered_at', 'DESC']]
    });
    return rows.map(toPlain);
}

async function findAvailableJockeys() {
    const M = models();
    const rows = await M.Jockey.findAll({
        where: { status: 'active' },
        include: [
            { model: M.User, as: 'user', attributes: ['id', 'full_name', 'email'] }
        ],
        order: [['total_wins', 'DESC'], ['total_races', 'DESC']]
    });
    return rows.map(toPlain);
}

async function findJockeyById(jockeyId) {
    const M = models();
    const row = await M.Jockey.findByPk(jockeyId, {
        include: [
            { model: M.User, as: 'user', attributes: ['id', 'full_name', 'email'] }
        ]
    });
    return toPlain(row);
}

async function findTournamentById(tournamentId) {
    const M = models();
    const row = await M.Tournament.findByPk(tournamentId);
    return toPlain(row);
}

async function findTournaments() {
    const M = models();
    const rows = await M.Tournament.findAll({
        order: [['start_date', 'ASC'], ['created_at', 'DESC']]
    });
    return rows.map(toPlain);
}

async function findRacesByTournamentIds(tournamentIds) {
    if (!tournamentIds || !tournamentIds.length) return [];
    const M = models();
    const rows = await M.Race.findAll({
        where: {
            tournament_id: { [Op.in]: tournamentIds },
            deleted_at: null
        },
        attributes: ['id', 'tournament_id', 'prize_pool', 'prize_currency', 'status']
    });
    return rows.map(toPlain);
}

async function findRoundsByTournamentIds(tournamentIds) {
    if (!tournamentIds || !tournamentIds.length) return [];
    const M = models();
    const rows = await M.Round.findAll({
        where: {
            tournament_id: { [Op.in]: tournamentIds }
        },
        order: [['round_order', 'ASC']]
    });
    return rows.map(toPlain);
}

async function findRacesByRoundIds(roundIds) {
    if (!roundIds || !roundIds.length) return [];
    const M = models();
    const rows = await M.Race.findAll({
        where: {
            round_id: { [Op.in]: roundIds },
            deleted_at: null
        }
    });
    return rows.map(toPlain);
}

async function findRacesByOwnerId(ownerId) {
    const M = models();
    const rows = await M.Registration.findAll({
        where: { owner_id: ownerId },
        order: [['registered_at', 'DESC']]
    });
    return rows.map(toPlain);
}

async function findJockeyAssignmentsByHorseId(horseId) {
    const M = models();
    const rows = await M.JockeyAssignment.findAll({
        where: { horse_id: horseId },
        order: [['assigned_at', 'DESC']]
    });
    return rows.map(toPlain);
}

module.exports = {
    findProfileByUserId,
    updateProfileById,
    findHorsesByOwnerId,
    createHorse,
    findHorseById,
    updateHorseById,
    findHorseChecksByHorseId,
    findRegistrationsByHorseId,
    findAvailableJockeys,
    findJockeyById,
    findTournamentById,
    findTournaments,
    findRacesByTournamentIds,
    findRoundsByTournamentIds,
    findRacesByRoundIds,
    findRacesByOwnerId,
    findJockeyAssignmentsByHorseId
};
