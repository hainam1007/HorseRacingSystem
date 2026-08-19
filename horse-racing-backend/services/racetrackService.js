'use strict';

const ApiError = require('../utils/ApiError');
const racetrackRepository = require('../repositories/racetrackRepository');
const raceRepository = require('../repositories/raceRepository');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { Op } = require('sequelize');

function getModels() {
    return loadSequelizeModels().models;
}

async function createRacetrack(payload) {
    if (!payload.name || !payload.name.trim()) {
        throw new ApiError(400, 'Tên sân đấu không được để trống.');
    }
    if (!payload.code || !payload.code.trim()) {
        throw new ApiError(400, 'Mã sân đấu không được để trống.');
    }

    const code = String(payload.code).trim().toUpperCase();
    const existing = await racetrackRepository.findByCode(code);
    if (existing) {
        throw new ApiError(409, `Mã sân đấu '${code}' đã tồn tại.`);
    }

    const trackData = {
        name: String(payload.name).trim(),
        code: code,
        location: payload.location ? String(payload.location).trim() : null,
        max_horses: payload.max_horses ? Math.min(30, Math.max(1, Number(payload.max_horses))) : 12,
        surface: ['Turf', 'Dirt', 'Synthetic'].includes(payload.surface) ? payload.surface : 'Turf',
        length_m: payload.length_m ? Math.max(400, Number(payload.length_m)) : 1400,
        attributes: typeof payload.attributes === 'object' && payload.attributes !== null ? payload.attributes : {},
        description: payload.description ? String(payload.description).trim() : null,
        status: ['active', 'maintenance', 'inactive'].includes(payload.status) ? payload.status : 'active'
    };

    const racetrack = await racetrackRepository.create(trackData);
    return { racetrack };
}

async function listRacetracks(query = {}) {
    const filter = {};
    if (query.status) {
        filter.status = query.status;
    }
    if (query.name) {
        filter.name = query.name;
    }

    const racetracks = await racetrackRepository.find(filter);
    return { racetracks };
}

async function getRacetrack(id) {
    const racetrack = await racetrackRepository.findById(id);
    if (!racetrack) {
        throw new ApiError(404, 'Không tìm thấy sân đấu.');
    }

    // Attach upcoming races count
    const models = getModels();
    const activeRacesCount = await models.Race.count({
        where: {
            racetrack_id: id,
            status: { [Op.in]: ['scheduled', 'starting', 'in_progress'] }
        }
    });

    return {
        racetrack: Object.assign({}, racetrack, { active_races_count: activeRacesCount })
    };
}

async function updateRacetrack(id, payload) {
    const racetrack = await racetrackRepository.findById(id);
    if (!racetrack) {
        throw new ApiError(404, 'Không tìm thấy sân đấu.');
    }

    if (payload.code && payload.code.toUpperCase() !== racetrack.code) {
        const code = String(payload.code).trim().toUpperCase();
        const existing = await racetrackRepository.findByCode(code);
        if (existing && existing.id !== id) {
            throw new ApiError(409, `Mã sân đấu '${code}' đã tồn tại.`);
        }
    }

    const updateData = {};
    if (payload.name !== undefined) updateData.name = String(payload.name).trim();
    if (payload.code !== undefined) updateData.code = String(payload.code).trim().toUpperCase();
    if (payload.location !== undefined) updateData.location = payload.location ? String(payload.location).trim() : null;
    if (payload.max_horses !== undefined) updateData.max_horses = Math.min(30, Math.max(1, Number(payload.max_horses)));
    if (payload.surface !== undefined && ['Turf', 'Dirt', 'Synthetic'].includes(payload.surface)) updateData.surface = payload.surface;
    if (payload.length_m !== undefined) updateData.length_m = Math.max(400, Number(payload.length_m));
    if (payload.attributes !== undefined) updateData.attributes = typeof payload.attributes === 'object' && payload.attributes !== null ? payload.attributes : {};
    if (payload.description !== undefined) updateData.description = payload.description ? String(payload.description).trim() : null;
    if (payload.status !== undefined && ['active', 'maintenance', 'inactive'].includes(payload.status)) updateData.status = payload.status;

    const updated = await racetrackRepository.updateById(id, updateData);
    return { racetrack: updated };
}

async function deleteRacetrack(id) {
    const racetrack = await racetrackRepository.findById(id);
    if (!racetrack) {
        throw new ApiError(404, 'Không tìm thấy sân đấu.');
    }

    // Check if there are active races
    const models = getModels();
    const activeRace = await models.Race.findOne({
        where: {
            racetrack_id: id,
            status: { [Op.in]: ['scheduled', 'starting', 'in_progress'] }
        }
    });

    if (activeRace) {
        throw new ApiError(400, 'Không thể xóa/vô hiệu hóa sân đấu đang có trận đua chuẩn bị diễn ra.');
    }

    await racetrackRepository.softDeleteById(id);
    return { message: 'Đã ngưng hoạt động sân đấu thành công.' };
}

async function getAvailableSlots(racetrackId, dateStr) {
    const racetrack = await racetrackRepository.findById(racetrackId);
    if (!racetrack) {
        throw new ApiError(404, 'Không tìm thấy sân đấu.');
    }
    if (racetrack.status !== 'active') {
        throw new ApiError(400, `Sân đấu đang ở trạng thái '${racetrack.status}', không thể xếp lịch.`);
    }

    const baseDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(baseDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(baseDate.setHours(23, 59, 59, 999));

    const models = getModels();
    const scheduledRaces = await models.Race.findAll({
        where: {
            racetrack_id: racetrackId,
            status: { [Op.ne]: 'cancelled' },
            starting_at: {
                [Op.between]: [startOfDay, endOfDay]
            }
        },
        order: [['starting_at', 'ASC']]
    });

    const bookedSlots = scheduledRaces.map((r) => ({
        race_id: r.id,
        race_name: r.name,
        starting_at: r.starting_at,
        ending_at: new Date(new Date(r.starting_at).getTime() + 30 * 60 * 1000) // 30-min window
    }));

    return {
        racetrack_id: racetrackId,
        racetrack_name: racetrack.name,
        date: startOfDay.toISOString().split('T')[0],
        max_horses: racetrack.max_horses,
        surface: racetrack.surface,
        booked_slots: bookedSlots
    };
}

async function getLiveStatus() {
    const racetracks = await racetrackRepository.find({ status: 'active' });
    const models = getModels();

    const activeRaces = await models.Race.findAll({
        where: {
            status: { [Op.in]: ['scheduled', 'starting', 'in_progress'] }
        },
        include: [
            { model: models.Tournament, as: 'tournament', attributes: ['id', 'name'] },
            { model: models.Racetrack, as: 'racetrack', attributes: ['id', 'name', 'code', 'surface', 'max_horses'] }
        ],
        order: [['starting_at', 'ASC']]
    });

    const trackStatusList = racetracks.map((track) => {
        const trackRaces = activeRaces.filter((r) => r.racetrack_id === track.id);
        const currentRunning = trackRaces.find((r) => ['starting', 'in_progress'].includes(r.status));
        const nextScheduled = trackRaces.find((r) => r.status === 'scheduled');

        return {
            racetrack_id: track.id,
            name: track.name,
            code: track.code,
            location: track.location,
            surface: track.surface,
            max_horses: track.max_horses,
            status: track.status,
            current_running_race: currentRunning ? { id: currentRunning.id, name: currentRunning.name, status: currentRunning.status } : null,
            next_scheduled_race: nextScheduled ? { id: nextScheduled.id, name: nextScheduled.name, starting_at: nextScheduled.starting_at } : null,
            total_active_races: trackRaces.length
        };
    });

    return { tracks: trackStatusList };
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
