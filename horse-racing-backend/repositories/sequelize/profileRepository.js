'use strict';

/**
 * Sequelize-backed profile repository.
 * Mirrors the legacy profileRepository API.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');

let _models = null;
function models() {
    if (!_models) _models = loadSequelizeModels().models;
    return _models;
}

function buildHorseOwnerProfile(userId, profileData) {
    return {
        user_id: userId,
        stable_name: profileData.stable_name,
        address: profileData.address,
        license_number: profileData.license_number,
        status: profileData.status || 'active'
    };
}

function buildJockeyProfile(userId, profileData) {
    return {
        user_id: userId,
        height: profileData.height,
        weight_kg: profileData.weight_kg === undefined ? profileData.weight : profileData.weight_kg,
        experience_years: profileData.experience_years || 0,
        license_number: profileData.license_number,
        total_races: profileData.total_races || 0,
        total_wins: profileData.total_wins || 0,
        status: profileData.status || 'active'
    };
}

function buildRaceRefereeProfile(userId, profileData) {
    return {
        user_id: userId,
        license_number: profileData.license_number,
        experience_years: profileData.experience_years || 0,
        status: profileData.status || 'active'
    };
}

const ROLE_NAMES = require('../../constants/roles').ROLE_NAMES;

async function createProfiles(userId, roleNames, profiles) {
    const M = models();
    const createdProfiles = {};
    const profileData = profiles || {};

    if (roleNames.includes(ROLE_NAMES.HORSE_OWNER)) {
        createdProfiles.horse_owner = toPlain(await M.HorseOwner.create(
            buildHorseOwnerProfile(userId, profileData.horse_owner || {})
        ));
    }

    if (roleNames.includes(ROLE_NAMES.JOCKEY)) {
        createdProfiles.jockey = toPlain(await M.Jockey.create(
            buildJockeyProfile(userId, profileData.jockey || {})
        ));
    }

    if (roleNames.includes(ROLE_NAMES.RACE_REFEREE)) {
        createdProfiles.race_referee = toPlain(await M.RaceReferee.create(
            buildRaceRefereeProfile(userId, profileData.race_referee || {})
        ));
    }

    return createdProfiles;
}

async function findHorseOwnerByUserId(userId) {
    const M = models();
    return toPlain(await M.HorseOwner.findOne({ where: { user_id: userId } }));
}

async function findJockeyByUserId(userId) {
    const M = models();
    return toPlain(await M.Jockey.findOne({ where: { user_id: userId } }));
}

async function findRaceRefereeByUserId(userId) {
    const M = models();
    return toPlain(await M.RaceReferee.findOne({ where: { user_id: userId } }));
}

async function findRaceRefereeById(id) {
    const M = models();
    return toPlain(await M.RaceReferee.findByPk(id));
}

async function updateJockeyByUserId(userId, updateData) {
    const M = models();
    const fields = require('./adapter').projectUpdate(updateData);
    await M.Jockey.update(fields, { where: { user_id: userId } });
    return findJockeyByUserId(userId);
}

async function getProfilesByUserId(userId) {
    const M = models();
    const [horseOwner, jockey, raceReferee] = await Promise.all([
        M.HorseOwner.findOne({ where: { user_id: userId } }),
        M.Jockey.findOne({ where: { user_id: userId } }),
        M.RaceReferee.findOne({ where: { user_id: userId } })
    ]);

    const profiles = {};

    if (horseOwner) {
        profiles.horse_owner = toPlain(horseOwner);
    }

    if (jockey) {
        profiles.jockey = toPlain(jockey);
    }

    if (raceReferee) {
        profiles.race_referee = toPlain(raceReferee);
    }

    return profiles;
}

module.exports = {
    createProfiles,
    findHorseOwnerByUserId,
    findJockeyByUserId,
    findRaceRefereeById,
    findRaceRefereeByUserId,
    updateJockeyByUserId,
    getProfilesByUserId
};