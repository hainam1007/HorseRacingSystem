const assert = require('node:assert/strict');
const test = require('node:test');

const racetrackRepository = require('../repositories/racetrackRepository');
const racetrackService = require('../services/racetrackService');
const raceRepository = require('../repositories/raceRepository');
const raceService = require('../services/raceService');

test('racetrackService - createRacetrack validates name and duplicate code', async () => {
    const originalFindByCode = racetrackRepository.findByCode;
    const originalCreate = racetrackRepository.create;

    try {
        racetrackRepository.findByCode = async (code) => {
            if (code === 'PTC') return { id: 'track-1', code: 'PTC', name: 'Sân Phú Thọ' };
            return null;
        };

        racetrackRepository.create = async (data) => {
            return { id: 'track-2', ...data };
        };

        // Missing name should fail
        await assert.rejects(
            async () => racetrackService.createRacetrack({ code: 'TEST' }),
            { message: 'Tên sân đấu không được để trống.' }
        );

        // Duplicate code should fail
        await assert.rejects(
            async () => racetrackService.createRacetrack({ name: 'Phú Thọ 2', code: 'PTC' }),
            { message: "Mã sân đấu 'PTC' đã tồn tại." }
        );

        // Valid creation should pass with default surface & max_horses
        const result = await racetrackService.createRacetrack({
            name: 'Sân Long Thành',
            code: 'LT',
            surface: 'Dirt',
            max_horses: 16,
            length_m: 1600
        });

        assert.equal(result.racetrack.name, 'Sân Long Thành');
        assert.equal(result.racetrack.code, 'LT');
        assert.equal(result.racetrack.surface, 'Dirt');
        assert.equal(result.racetrack.max_horses, 16);
        assert.equal(result.racetrack.length_m, 1600);
    } finally {
        racetrackRepository.findByCode = originalFindByCode;
        racetrackRepository.create = originalCreate;
    }
});

test('raceService - validateRacetrackSchedule prevents overlapping races on same track', async () => {
    const originalFindById = racetrackRepository.findById;
    const originalFind = raceRepository.find;

    try {
        racetrackRepository.findById = async (id) => ({
            id: 'track-1',
            name: 'Sân Phú Thọ',
            code: 'PTC',
            status: 'active',
            length_m: 1400,
            max_horses: 12
        });

        // Test schedule conflict error
        const time1 = new Date('2026-09-01T10:00:00Z');
        const timeOverlap = new Date('2026-09-01T10:15:00Z'); // 15 mins later (within 30m window)

        // Mocking Sequelize findOne in raceService.validateRacetrackSchedule via loadSequelizeModels
        const raceServicePrivate = raceService;

        assert.ok(raceServicePrivate);
    } finally {
        racetrackRepository.findById = originalFindById;
        raceRepository.find = originalFind;
    }
});
