'use strict';

/**
 * raceService — Sequelize/PostgreSQL implementation.
 *
 * Business logic and API response shape preserved from the legacy
 * service.
 *
 * Legacy-ORM concepts translated to Sequelize:
 *   - The legacy ORM-specific imports are replaced by `loadSequelizeModels()`.
 *   - `Models.X.find({...}).populate({...}).populate({...}).sort()` →
 *     Sequelize `findAll({ where, include, order })`.
 *   - `Models.X.findById(id).lean()` → `Models.X.findByPk(id)` and
 *     `toPlain` (to expose the `_id` alias).
 *   - `JockeyAssignment.find({...}).populate({...})` → same pattern.
 *   - Transactional flow: the legacy `session.withTransaction(...)` pattern
 *     is replaced by `sequelize.transaction()` (Sequelize supports managed
 *     transactions).
 *
 * Service-level helpers preserved: `documentId`, `sameId`, `getDocumentId`,
 * `toPlainRace`, `withParticipantCounts`, `ensureCanControlRace`, etc.
 *
 * NOTE: `Registration` and `JockeyAssignment` in the original service were
 * pulled from the legacy aggregate barrel. This implementation pulls them
 * from Sequelize via `loadSequelizeModels().models`.
 */

const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const betRepository = require('../repositories/betRepository');
const profileRepository = require('../repositories/profileRepository');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const racetrackRepository = require('../repositories/racetrackRepository');
const registrationRepository = require('../repositories/registrationRepository');
const roundRepository = require('../repositories/roundRepository');
const tournamentRepository = require('../repositories/tournamentRepository');
const raceEngineService = require('./raceEngineService');
const cloudinaryService = require('./cloudinaryService');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { ASSIGNMENT_STATUS, ODDS_MARKET_STATUS, REGISTRATION_STATUS } = require('../constants/statuses');

const LOCK_OFFSET_MS = 3 * 60 * 60 * 1000;
const RACE_START_STALE_MS = 2 * 60 * 1000;

function getModels() {
    return loadSequelizeModels().models;
}

function getSequelize() {
    return loadSequelizeModels().sequelize;
}

function hasRole(req, role) {
    return (req.roles || req.auth.roles || []).includes(role);
}

function sameId(first, second) {
    return first && second && first.toString() === second.toString();
}

function getDocumentId(value) {
    return value && (value._id || value.id || value);
}

function toPlainRace(race) {
    return race && typeof race.toObject === 'function' ? race.toObject() : race;
}

async function withParticipantCounts(races) {
    const raceList = Array.isArray(races) ? races : [races];
    const raceIds = raceList.map(function(race) {
        return getDocumentId(race);
    }).filter(Boolean);

    if (!raceIds.length) {
        return Array.isArray(races) ? raceList : races;
    }

    const models = getModels();
    const { Registration } = models;

    // Sequelize path: GROUP BY race_id via Sequelize aggregation.
    const groups = await Registration.findAll({
        attributes: [
            'race_id',
            [getSequelize().fn('COUNT', getSequelize().col('id')), 'count']
        ],
        where: {
            race_id: { [require('sequelize').Op.in]: raceIds },
            status: REGISTRATION_STATUS.APPROVED
        },
        group: ['race_id'],
        raw: true
    });

    const countByRaceId = new Map(groups.map(function(item) {
        const id = item.race_id;
        return [id && id.toString(), Number(item.count)];
    }));

    const enriched = raceList.map(function(race) {
        const plainRace = toPlainRace(race);
        const raceId = getDocumentId(race);
        const participantCount = raceId ? countByRaceId.get(raceId.toString()) || 0 : 0;

        return Object.assign({}, plainRace, {
            participant_count: participantCount,
            runner_count: participantCount
        });
    });

    return Array.isArray(races) ? enriched : enriched[0];
}

async function ensureCanControlRace(req, race) {
    const assignedRefereeId = getDocumentId(race.referee_id);

    if (!assignedRefereeId) {
        throw new ApiError(400, 'Race referee is required');
    }

    if (hasRole(req, ROLE_NAMES.ADMIN)) {
        return;
    }

    const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

    if (!referee || !sameId(assignedRefereeId, referee._id)) {
        throw new ApiError(403, 'You can only control races assigned to you');
    }
}

function applyRegistrationLockAt(payload) {
    const data = Object.assign({}, payload);

    if (data.race_date) {
        data.registration_lock_at = new Date(new Date(data.race_date).getTime() - LOCK_OFFSET_MS);
    }

    return data;
}

async function prepareRacePayload(payload) {
    const data = Object.assign({}, payload || {});
    const imageFileData = data.image_file_data;

    delete data.image_file_data;
    delete data.image_file_name;
    delete data.image_preview;

    if (imageFileData === undefined || imageFileData === '') {
        return data;
    }

    if (typeof imageFileData !== 'string' || !imageFileData.startsWith('data:image/')) {
        throw new ApiError(400, 'Race image must be an image file');
    }

    const upload = await cloudinaryService.uploadAsset(imageFileData, {
        folder: 'horse-racing/races',
        resource_type: 'image'
    });

    data.image_url = upload.secure_url;
    data.image_public_id = upload.public_id || undefined;
    return data;
}

async function validateRaceLinks(payload) {
    if (payload.tournament_id) {
        const tournament = await tournamentRepository.findById(payload.tournament_id);

        if (!tournament) {
            throw new ApiError(404, 'Tournament not found');
        }
    }

    if (payload.round_id) {
        const round = await roundRepository.findById(payload.round_id);

        if (!round) {
            throw new ApiError(404, 'Round not found');
        }
    }

    if (payload.referee_id) {
        const referee = await profileRepository.findRaceRefereeById(payload.referee_id);

        if (!referee) {
            throw new ApiError(404, 'Race referee not found');
        }
    }
}

async function getActiveRacetrack(racetrackId) {
    const racetrack = await racetrackRepository.findById(racetrackId);

    if (!racetrack) {
        throw new ApiError(404, 'Racetrack not found');
    }

    if (racetrack.status !== 'active') {
        throw new ApiError(422, 'Only active racetracks can be used for a race');
    }

    return racetrack;
}

function buildEligibilityRuleSnapshot(racetrack) {
    return {
        racetrack_id: getDocumentId(racetrack),
        racetrack_code: racetrack.code,
        rule_version: racetrack.rule_version,
        rule: racetrack.eligibility_rule
    };
}

function applyRacetrackToRacePayload(payload, racetrack) {
    return {
        ...payload,
        racetrack_id: getDocumentId(racetrack),
        location: racetrack.name,
        venue_code: racetrack.code,
        eligibility_rule_snapshot: buildEligibilityRuleSnapshot(racetrack)
    };
}

function attachRacetrack(race, racetrack) {
    if (!race) return race;
    return Object.assign({}, race, { racetrack: racetrack || race.racetrack || null });
}

async function assertRacetrackCanChange(existingRace) {
    const blockers = [];
    const raceId = getDocumentId(existingRace);

    if (existingRace.entries_finalized_at || existingRace.entries_finalized_by || existingRace.status === 'entries_finalized') {
        blockers.push('ENTRIES_FINALIZED');
    }
    if (existingRace.betting_status === 'open') {
        blockers.push('BETTING_OPEN');
    }
    if (existingRace.started_at || ['starting', 'running', 'completed'].includes(existingRace.status)) {
        blockers.push('RACE_ALREADY_STARTED_OR_COMPLETED');
    }

    const [hasUncancelledRegistration, hasPendingOrPaidPayment, hasReservedSlot, oddsMarket] = await Promise.all([
        registrationRepository.hasUncancelledRegistrationForRace(raceId),
        registrationRepository.hasPendingOrPaidPaymentForRace(raceId),
        registrationRepository.hasReservedSlotForRace(raceId),
        raceOddsMarketRepository.findByRaceId(raceId)
    ]);

    if (hasUncancelledRegistration) blockers.push('UNCANCELLED_REGISTRATION');
    if (hasPendingOrPaidPayment) blockers.push('PAYMENT_PENDING_OR_PAID');
    if (hasReservedSlot) blockers.push('REGISTRATION_SLOT_RESERVED');
    if (oddsMarket) blockers.push('ODDS_MARKET_CREATED');

    if (blockers.length) {
        throw new ApiError(409, 'Racetrack cannot be changed after race activity has begun', { blockers });
    }
}

async function createRace(payload) {
    const racePayload = await prepareRacePayload(payload);
    await validateRaceLinks(racePayload);
    const racetrack = await getActiveRacetrack(racePayload.racetrack_id);

    const race = await raceRepository.create(
        applyRegistrationLockAt(applyRacetrackToRacePayload(racePayload, racetrack))
    );

    return {
        race: attachRacetrack(race, racetrack)
    };
}

async function listRaces(req, query) {
    const filter = {};

    ['tournament_id', 'round_id', 'referee_id', 'status'].forEach(function(field) {
        if (query[field]) {
            filter[field] = query[field];
        }
    });

    if (hasRole(req, ROLE_NAMES.RACE_REFEREE) && !hasRole(req, ROLE_NAMES.ADMIN)) {
        const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

        if (!referee) {
            throw new ApiError(404, 'Race referee profile not found');
        }

        filter.referee_id = referee._id;
    }

    return {
        races: await withParticipantCounts(await raceRepository.find(filter))
    };
}

async function getRace(id) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    return {
        race: await withParticipantCounts(race)
    };
}

function documentId(value) {
    return value && (value._id || value);
}

async function ensureRefereeCanReadRace(req, race) {
    if (!hasRole(req, ROLE_NAMES.RACE_REFEREE) || hasRole(req, ROLE_NAMES.ADMIN)) {
        return;
    }

    const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);
    const assignedRefereeId = documentId(race.referee_id);

    if (!referee || !assignedRefereeId || assignedRefereeId.toString() !== referee._id.toString()) {
        throw new ApiError(403, 'You can only view participants for races assigned to you');
    }
}

async function getRaceParticipants(req, id) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    await ensureRefereeCanReadRace(req, race);

    const models = getModels();
    const { Op } = require('sequelize');
    const { Registration, JockeyAssignment, Horse, HorseOwner, User, Jockey } = models;

    // Sequelize equivalent of the legacy chained populate:
    // Registration → horse_id → owner_id → user_id
    // Registration → owner_id → user_id
    const registrations = await Registration.findAll({
        where: {
            race_id: race._id,
            status: REGISTRATION_STATUS.APPROVED
        },
        include: [
            {
                model: Horse,
                as: 'horse',
                include: [
                    {
                        model: HorseOwner,
                        as: 'owner',
                        include: [
                            { model: User, as: 'user', attributes: ['full_name', 'email'] }
                        ]
                    }
                ]
            },
            {
                model: HorseOwner,
                as: 'owner',
                include: [
                    { model: User, as: 'user', attributes: ['full_name', 'email'] }
                ]
            }
        ],
        order: [['registered_at', 'ASC']]
    });

    const horseIds = registrations.map(r => documentId(r.horse_id)).filter(Boolean);

    const assignments = horseIds.length
        ? await JockeyAssignment.findAll({
            where: {
                race_id: race._id,
                horse_id: { [Op.in]: horseIds },
                assignment_type: 'primary',
                status: ASSIGNMENT_STATUS.ACCEPTED
            },
            include: [
                {
                    model: Jockey,
                    as: 'jockey',
                    include: [
                        { model: User, as: 'user', attributes: ['full_name', 'email'] }
                    ]
                }
            ]
        })
        : [];

    const assignmentsByHorse = new Map(assignments.map(a => [
        documentId(a.horse_id).toString(),
        a
    ]));

    return {
        race: race,
        participants: registrations.map(function(registration) {
            const horseId = documentId(registration.horse_id);

            return {
                registration: registration,
                horse: registration.horse,
                owner: registration.owner,
                assignment: horseId ? assignmentsByHorse.get(horseId.toString()) || null : null
            };
        })
    };
}

async function updateRace(id, payload) {
    const existingRace = await raceRepository.findById(id);

    if (!existingRace) {
        throw new ApiError(404, 'Race not found');
    }

    const racePayload = await prepareRacePayload(payload);

    await validateRaceLinks(racePayload);

    let racetrack = null;
    if (racePayload.racetrack_id && !sameId(racePayload.racetrack_id, existingRace.racetrack_id)) {
        await assertRacetrackCanChange(existingRace);
        racetrack = await getActiveRacetrack(racePayload.racetrack_id);
    }

    const payloadWithRacetrack = racetrack
        ? applyRacetrackToRacePayload(racePayload, racetrack)
        : racePayload;

    const race = await raceRepository.updateById(id, applyRegistrationLockAt(payloadWithRacetrack));

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    return {
        race: attachRacetrack(race, racetrack)
    };
}

function normalizeStakeLimit(value, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new ApiError(400, 'Stake limits must be positive numbers');
    }

    return parsed;
}

function buildBettingMarketPayload(race, market, payload) {
    const currentMarket = (race && race.betting_market) || {};
    const minStake = normalizeStakeLimit(payload.min_stake, currentMarket.min_stake || 1);
    const maxStake = normalizeStakeLimit(payload.max_stake, currentMarket.max_stake || 1000);

    if (maxStake < minStake) {
        throw new ApiError(400, 'max_stake must be greater than or equal to min_stake');
    }

    return {
        status: ODDS_MARKET_STATUS.OPEN,
        opens_at: new Date(),
        closes_at: payload.closes_at ? new Date(payload.closes_at) : currentMarket.closes_at,
        min_stake: minStake,
        max_stake: maxStake,
        currency: payload.currency || currentMarket.currency || 'TOKEN',
        odds_market_id: market && market._id
    };
}

async function openRegistrationForDemo(id) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    const nextRaceDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const updatedRace = await raceRepository.updateById(race._id, {
        race_date: nextRaceDate,
        registration_locked: false,
        registration_lock_at: new Date(nextRaceDate.getTime() - LOCK_OFFSET_MS),
        status: 'scheduled',
        starting_at: null,
        started_at: null
    });

    return {
        race: updatedRace
    };
}

async function setRegistrationDemoMode(payload) {
    if (typeof payload.enabled !== 'boolean') {
        throw new ApiError(400, 'enabled must be a boolean');
    }

    if (!payload.enabled) {
        const updateResult = await raceRepository.updateMany(
            { registration_locked: { $ne: true } },
            {
                registration_locked: true,
                registration_lock_at: new Date()
            }
        );

        return {
            enabled: false,
            updated_count: updateResult.modifiedCount || 0
        };
    }

    const nextRaceDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nextLockAt = new Date(nextRaceDate.getTime() - LOCK_OFFSET_MS);
    const updateResult = await raceRepository.updateMany(
        { status: 'scheduled' },
        {
            race_date: nextRaceDate,
            registration_locked: false,
            registration_lock_at: nextLockAt,
            status: 'scheduled'
        }
    );

    return {
        enabled: true,
        updated_count: updateResult.modifiedCount || 0,
        race_date: nextRaceDate,
        registration_lock_at: nextLockAt
    };
}

async function ensureDemoTimelineCanChange(race) {
    if (String(race.status || '').toLowerCase() !== 'scheduled') {
        throw new ApiError(409, 'Only a scheduled race can be prepared for the demo timeline');
    }

    const betCount = await betRepository.count({ race_id: race._id });
    if (betCount > 0) {
        throw new ApiError(409, 'The demo timeline cannot change after a spectator has placed a bet', {
            bet_count: betCount
        });
    }

    return betCount;
}

function demoBettingMarketPayload(race, marketStatus) {
    const currentMarket = race.betting_market || {};
    return {
        status: marketStatus,
        min_stake: Number(currentMarket.min_stake) || 1,
        max_stake: Number(currentMarket.max_stake) || 1000,
        currency: currentMarket.currency || 'TOKEN'
    };
}

/**
 * Purpose-built demo control. Unlike the legacy registration-demo endpoints,
 * this changes exactly one safe, scheduled race and takes the two timeline
 * dates explicitly from the Admin UI.
 */
async function prepareDemoTimeline(id, payload) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    await ensureDemoTimelineCanChange(race);
    const market = await raceOddsMarketRepository.findByRaceId(race._id);
    const nextMarketStatus = market ? ODDS_MARKET_STATUS.STALE : 'unavailable';

    if (market) {
        await raceOddsMarketRepository.updateByRaceId(race._id, {
            status: ODDS_MARKET_STATUS.STALE
        });
    }

    const updatedRace = await raceRepository.updateById(race._id, {
        race_date: payload.race_date,
        registration_lock_at: payload.registration_lock_at,
        registration_locked: false,
        starting_at: null,
        started_at: null,
        entries_finalized_at: null,
        entries_finalized_by: null,
        model_input_version: Number(race.model_input_version || 0) + 1,
        betting_status: nextMarketStatus,
        betting_closes_at: null,
        betting_market: demoBettingMarketPayload(race, nextMarketStatus)
    });

    return {
        race: updatedRace,
        market_reset: Boolean(market),
        registration_open: true
    };
}

/**
 * A per-race, deliberate shortcut for the hand-off from entry/jockey demo
 * to entry finalization and betting. It never affects other races.
 */
async function lockRegistrationForDemo(id) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    await ensureDemoTimelineCanChange(race);
    if (race.registration_locked) {
        return { race: race, locked: false };
    }

    const updatedRace = await raceRepository.updateById(race._id, {
        registration_locked: true,
        registration_lock_at: new Date()
    });

    return { race: updatedRace, locked: true };
}

async function deleteRace(id) {
    const race = await raceRepository.softDeleteById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    return {
        race: race
    };
}

async function openBetting(id, payload) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    if (race.status !== 'scheduled') {
        throw new ApiError(400, 'Only scheduled races can open betting');
    }

    const market = await raceOddsMarketRepository.findByRaceId(race._id);

    if (!market) {
        throw new ApiError(404, 'Race odds market not found. Generate odds before opening betting');
    }

    if (![ODDS_MARKET_STATUS.GENERATED, ODDS_MARKET_STATUS.OPEN].includes(market.status)) {
        throw new ApiError(400, 'Only generated or open odds markets can open betting', {
            market_status: market.status
        });
    }

    const bettingMarket = buildBettingMarketPayload(race, market, payload || {});
    if (market.status === ODDS_MARKET_STATUS.GENERATED) {
        await raceOddsMarketRepository.captureOpeningOdds(race._id);
    }
    const updatedMarket = await raceOddsMarketRepository.updateByRaceId(race._id, {
        status: ODDS_MARKET_STATUS.OPEN
    });
    const updatedRace = await raceRepository.updateById(race._id, {
        betting_status: ODDS_MARKET_STATUS.OPEN,
        betting_closes_at: bettingMarket.closes_at,
        betting_market: bettingMarket
    });

    return {
        race: updatedRace,
        market: updatedMarket
    };
}

async function closeRaceBetting(id) {
    const market = await raceOddsMarketRepository.findByRaceId(id);

    if (market && market.status !== ODDS_MARKET_STATUS.SETTLED) {
        await raceOddsMarketRepository.updateByRaceId(id, {
            status: ODDS_MARKET_STATUS.CLOSED
        });
    }

    return raceRepository.updateById(id, {
        betting_status: ODDS_MARKET_STATUS.CLOSED,
        'betting_market.status': ODDS_MARKET_STATUS.CLOSED
    });
}

async function closeBetting(id) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    return {
        race: await closeRaceBetting(race._id),
        market: await raceOddsMarketRepository.findByRaceId(race._id)
    };
}

async function startRace(req, id) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    await ensureCanControlRace(req, race);

    const startingAt = race.starting_at ? new Date(race.starting_at).getTime() : 0;
    const staleStart = race.status === 'starting' &&
        startingAt > 0 &&
        Date.now() - startingAt >= RACE_START_STALE_MS;

    if (race.status !== 'scheduled' && !staleStart) {
        throw new ApiError(400, 'Only scheduled races or stale start attempts can be started');
    }

    const startAttemptAt = new Date();

    await closeRaceBetting(race._id);

    const startingRace = await raceRepository.updateOne({
        _id: race._id,
        status: race.status,
        ...(race.status === 'starting' ? { starting_at: race.starting_at } : {})
    }, {
        $set: {
            status: 'starting',
            starting_at: startAttemptAt,
            registration_locked: true,
            betting_status: ODDS_MARKET_STATUS.CLOSED,
            'betting_market.status': ODDS_MARKET_STATUS.CLOSED
        },
        $unset: { started_at: 1 }
    });

    if (!startingRace) {
        throw new ApiError(409, 'Race status changed before it could be started');
    }

    let engine;

    try {
        const participantData = await raceEngineService.collectParticipants(race._id);

        const ineligibleParticipants = (participantData.participant_statuses || []).filter(function(participant) {
            return !participant.eligible;
        });

        if (ineligibleParticipants.length) {
            throw new ApiError(409, 'Race cannot start until every approved participant passes pre-race readiness', {
                blocked_participants: ineligibleParticipants.map(function(participant) {
                    return {
                        horse_id: getDocumentId(participant.horse),
                        blockers: participant.blockers
                    };
                })
            });
        }

        if (!participantData.participants.length) {
            throw new ApiError(400, 'Race has no eligible participants');
        }

        engine = await raceEngineService.generateProvisionalRaceRun(
            race._id,
            req.user._id,
            participantData
        );

        const runningRace = await raceRepository.updateOne({
            _id: race._id,
            status: 'starting',
            starting_at: startAttemptAt
        }, {
            $set: {
                status: 'running',
                started_at: new Date(),
                registration_locked: true,
                betting_status: ODDS_MARKET_STATUS.CLOSED,
                'betting_market.status': ODDS_MARKET_STATUS.CLOSED
            },
            $unset: { starting_at: 1 }
        });

        if (!runningRace) {
            throw new ApiError(409, 'Race start attempt changed before completion');
        }

        return { race: runningRace, engine: engine };
    } catch (error) {
        // Sequelize managed transaction (replaces the legacy session.withTransaction).
        const sequelize = getSequelize();
        try {
            await sequelize.transaction(async () => {
                const rolledBackRace = await raceRepository.updateOne({
                    _id: race._id,
                    status: 'starting',
                    starting_at: startAttemptAt
                }, {
                    $set: { status: 'scheduled' },
                    $unset: { starting_at: 1, started_at: 1 }
                });

                if (rolledBackRace && engine?.created && engine.race_run?._id) {
                    await raceEngineService.cancelProvisionalRaceRun(
                        engine.race_run._id,
                        {}
                    );
                }
            });
        } catch (rollbackError) {
            // Rollback best-effort; rethrow original error
            console.error('raceService.startRace rollback failed:', rollbackError.message);
        }

        throw error;
    }
}

async function completeRace(req, id) {
    const race = await raceRepository.findById(id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    await ensureCanControlRace(req, race);

    if (race.status !== 'running') {
        throw new ApiError(400, 'Only running races can be completed');
    }

    return {
        race: await raceRepository.updateById(race._id, {
            status: 'completed'
        })
    };
}

module.exports = {
    createRace,
    completeRace,
    listRaces,
    getRace,
    openRegistrationForDemo,
    setRegistrationDemoMode,
    prepareDemoTimeline,
    lockRegistrationForDemo,
    openBetting,
    closeBetting,
    startRace,
    getRaceParticipants,
    updateRace,
    deleteRace,
    _private: {
        buildBettingMarketPayload,
        closeRaceBetting
    }
};
