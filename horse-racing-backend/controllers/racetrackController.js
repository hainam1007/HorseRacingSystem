'use strict';

const racetrackService = require('../services/racetrackService');
const { sendSuccess } = require('../utils/apiResponse');

async function createRacetrack(req, res) {
    const data = await racetrackService.createRacetrack(req.body);
    return sendSuccess(res, 201, 'Tạo sân đấu mới thành công.', data);
}

async function listRacetracks(req, res) {
    const data = await racetrackService.listRacetracks(req.query);
    return sendSuccess(res, 200, 'Lấy danh sách sân đấu thành công.', data);
}

async function getRacetrack(req, res) {
    const data = await racetrackService.getRacetrack(req.params.id);
    return sendSuccess(res, 200, 'Lấy thông tin sân đấu thành công.', data);
}

async function updateRacetrack(req, res) {
    const data = await racetrackService.updateRacetrack(req.params.id, req.body);
    return sendSuccess(res, 200, 'Cập nhật sân đấu thành công.', data);
}

async function deleteRacetrack(req, res) {
    const data = await racetrackService.deleteRacetrack(req.params.id);
    return sendSuccess(res, 200, 'Xóa/Vô hiệu hóa sân đấu thành công.', data);
}

async function getAvailableSlots(req, res) {
    const data = await racetrackService.getAvailableSlots(req.params.id, req.query.date);
    return sendSuccess(res, 200, 'Lấy danh sách khung giờ trống của sân đấu thành công.', data);
}

async function getLiveStatus(req, res) {
    const data = await racetrackService.getLiveStatus();
    return sendSuccess(res, 200, 'Lấy trạng thái vận hành thời gian thực của các sân đấu thành công.', data);
}

module.exports = {
    createRacetrack,
    listRacetracks,
    getRacetrack,
    updateRacetrack,
    deleteRacetrack,
    getAvailableSlots,
    getLiveStatus
};
