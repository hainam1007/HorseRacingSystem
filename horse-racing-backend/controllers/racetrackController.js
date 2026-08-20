'use strict';

const racetrackService = require('../services/racetrackService');
const { sendSuccess } = require('../utils/apiResponse');

async function listRacetracks(req, res) {
    const data = await racetrackService.listRacetracks(req.query);
    return sendSuccess(res, 200, 'Racetracks retrieved successfully', data);
}

async function getRacetrack(req, res) {
    const data = await racetrackService.getRacetrack(req.params.id);
    return sendSuccess(res, 200, 'Racetrack retrieved successfully', data);
}

async function createRacetrack(req, res) {
    const data = await racetrackService.createRacetrack(req.validatedBody, req.user);
    return sendSuccess(res, 201, 'Racetrack created successfully', data);
}

async function updateRacetrack(req, res) {
    const data = await racetrackService.updateRacetrack(req.params.id, req.validatedBody, req.user);
    return sendSuccess(res, 200, 'Racetrack updated successfully', data);
}

async function archiveRacetrack(req, res) {
    const data = await racetrackService.archiveRacetrack(req.params.id, req.user);
    return sendSuccess(res, 200, 'Racetrack archived successfully', data);
}

module.exports = {
    listRacetracks,
    getRacetrack,
    createRacetrack,
    updateRacetrack,
    archiveRacetrack
};
