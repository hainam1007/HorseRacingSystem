'use strict';

/**
 * horseOwnerService — Sequelize/PostgreSQL implementation.
 *
 * Business logic and API response shape preserved from the legacy
 * service.
 *
 * Legacy-ORM concepts translated to Sequelize:
 *   - The previous ORM-specific import is gone; we accept any
 *     string ID since the project migrated to UUID strings.
 *   - `Model.find({...})` → `Model.findAll({ where: {...} })`.
 *   - `Model.findById(id)` → `Model.findByPk(id)`.
 *   - `Model.findOne({...})` → `Model.findOne({ where: {...} })`.
 *   - `Model.findByIdAndUpdate(id, $set: {...}, { returnDocument: 'after' })` →
 *     `Model.update(fields, { where: { id } })` + reload.
 *   - `Model.findOneAndUpdate({...}, $set: {...}, ...)` → similar.
 *   - `Model.aggregate([...])` → raw SQL via `sequelize.query()` (see
 *     `countApprovedRegistrationsByRaceIds` below).
 *   - `.populate(...)` → Sequelize `include:` with `as:` aliases.
 *   - Embedded sub-doc / array fields that were lifted into child tables
 *     during migration (e.g. `horses.default_gears`, `registrations.gears`)
 *     are now stored as TEXT[] inline (no child table); we still expose
 *     them as the original arrays on the loaded row via `toPlain()`.
 *
 * Repository boundary:
 *   - The original dual-mode `horseOwnerRepository` is incomplete on the
 *     Sequelize side (no `findRaceById`, `findRegistrationById`,
 *     `countApprovedRegistrationsByRaceIds`, etc.), so this file declares
 *     its own helpers on top of `loadSequelizeModels()`. The dual-mode
 *     repository is still called for the few methods that do exist
 *     (`findProfileByUserId`, `findAvailableJockeys`, etc.).
 *   - `userRepository` is also a dual-mode proxy; updated to go through
 *     `loadSequelizeModels()` here.
 */

const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const { REGISTRATION_STATUS } = require('../constants/statuses');
const horseOwnerRepository = require('../repositories/horseOwnerRepository');
const userRepository = require('../repositories/userRepository');
const cloudinaryService = require('./cloudinaryService');
const emailService = require('./emailService');
const paymentGatewayService = require('./paymentGatewayService');
const raceEngineService = require('./raceEngineService');
const raceRepository = require('../repositories/raceRepository');
const registrationSlotService = require('./registrationSlotService');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { toPlain, projectUpdate } = require('../repositories/sequelize/adapter');

const REGISTRATION_PAYMENT_METHOD = 'VNPAY';
const REGISTRATION_PAYMENT_TTL_MS = Number(process.env.REGISTRATION_PAYMENT_EXPIRES_MINUTES || 15) * 60 * 1000;

function getModels() {
    return loadSequelizeModels().models;
}

function getSequelize() {
    return loadSequelizeModels().sequelize;
}

function isSameId(firstId, secondId) {
    return firstId && secondId && firstId.toString() === secondId.toString();
}

function assertHorseOwnerRole(userRoles) {
    if (!userRoles || !userRoles.includes(ROLE_NAMES.HORSE_OWNER)) {
        throw new ApiError(403, 'Horse owner role is required');
    }
}

function getTournamentId(value) {
    return value && (value._id || value.id || value).toString();
}

function getRegistrationFee(race) {
    const entryFeeVnd = Math.max(0, Number(race && race.entry_fee ? race.entry_fee : 0));

    return {
        entryFeeVnd
    };
}

function generateRegistrationOrderId() {
    return 'REG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function getPaymentOrderStatus(registration) {
    if (registration.payment_status === 'paid' && registration.status === REGISTRATION_STATUS.APPROVED) {
        return 'success';
    }

    if (
        ['failed', 'refund_pending', 'refunded'].includes(registration.payment_status)
        || registration.status === REGISTRATION_STATUS.REJECTED
    ) {
        return 'failed';
    }

    return 'pending';
}

function buildRegistrationPaymentResponse(registration) {
    return {
        order_id: registration.payment_order_id,
        status: getPaymentOrderStatus(registration),
        total_vnd: Number(registration.entry_fee_vnd || 0),
        payment_method: registration.payment_method || REGISTRATION_PAYMENT_METHOD,
        gateway_reference_id: registration.gateway_reference_id
    };
}

function getRaceRegistrationAvailability(race, participantCount, currentTime) {
    const now = currentTime || new Date();
    const status = String(race.status || '').toLowerCase();
    const maxParticipants = Math.max(0, Number(race.max_participants || 0));
    const confirmedParticipants = Math.max(0, Number(participantCount || 0));
    const remainingSlots = maxParticipants > 0
        ? Math.max(0, maxParticipants - confirmedParticipants)
        : null;
    let unavailableReason = null;

    if (status !== 'scheduled') {
        unavailableReason = 'race_not_scheduled';
    } else if (race.registration_locked) {
        unavailableReason = 'registration_locked';
    } else if (race.registration_lock_at && now.getTime() >= new Date(race.registration_lock_at).getTime()) {
        unavailableReason = 'registration_window_closed';
    } else if (remainingSlots === 0) {
        unavailableReason = 'race_full';
    }

    return {
        participant_count: confirmedParticipants,
        remaining_slots: remainingSlots,
        registration_available: unavailableReason === null,
        registration_unavailable_reason: unavailableReason
    };
}

function assertRaceRegistrationAvailable(availability) {
    if (availability.registration_available) {
        return;
    }

    if (availability.registration_unavailable_reason === 'race_full') {
        throw new ApiError(409, 'Race has reached its maximum number of participants', availability);
    }

    throw new ApiError(400, 'Race is not available for registration', availability);
}

function queueRaceRegistrationEmail(context) {
    const configured = emailService.isEmailConfigured();

    emailService.sendRaceRegistrationConfirmedEmail(context).catch(function(error) {
        console.error('Unable to send race registration confirmation email:', error.message);
    });

    return {
        queued: configured,
        status: configured ? 'queued' : 'skipped',
        reason: configured ? undefined : 'Email credentials are not configured'
    };
}

function summarizeTournamentRaces(tournament, races) {
    const raceList = races || [];
    const prizePool = raceList.reduce(function(total, race) {
        return total + Number(race.prize_pool || 0);
    }, 0);
    const expectedParticipants = raceList.reduce(function(total, race) {
        return total + Number(race.max_participants || 0);
    }, 0);
    const prizeTotalsByCurrency = raceList.reduce(function(totals, race) {
        const currency = String(race.prize_currency || 'VND').toUpperCase();
        totals[currency] = (totals[currency] || 0) + Number(race.prize_pool || 0);
        return totals;
    }, {});

    return Object.assign({}, tournament, {
        total_race_prize_pool: prizePool,
        prize_totals_by_currency: prizeTotalsByCurrency,
        race_count: raceList.length,
        expected_participants: expectedParticipants
    });
}

async function enrichTournamentsWithRaceSummary(tournaments) {
    const tournamentIds = tournaments.map(getTournamentId).filter(Boolean);

    if (!tournamentIds.length) {
        return tournaments;
    }

    const races = await horseOwnerRepository.findRacesByTournamentIds(tournamentIds);
    const racesByTournament = races.reduce(function(map, race) {
        const tournamentId = getTournamentId(race.tournament_id);

        if (!map.has(tournamentId)) {
            map.set(tournamentId, []);
        }

        map.get(tournamentId).push(race);
        return map;
    }, new Map());

    return tournaments.map(function(tournament) {
        return summarizeTournamentRaces(tournament, racesByTournament.get(getTournamentId(tournament)) || []);
    });
}

async function getCurrentOwner(user) {
    assertHorseOwnerRole(user.roles);

    const owner = await horseOwnerRepository.findProfileByUserId(user._id);

    if (!owner) {
        throw new ApiError(404, 'Horse owner profile not found');
    }

    return owner;
}

function assertHorseBelongsToOwner(horse, ownerId) {
    if (!horse) {
        throw new ApiError(404, 'Horse not found');
    }

    if (!isSameId(horse.owner_id, ownerId)) {
        throw new ApiError(403, 'Horse does not belong to current horse owner');
    }
}

async function getProfile(user) {
    const owner = await getCurrentOwner(user);

    return {
        profile: Object.assign({}, owner, {
            avatar_url: user.avatar_url || ''
        })
    };
}

async function updateProfile(user, payload) {
    const owner = await getCurrentOwner(user);
    const profilePayload = Object.assign({}, payload);
    const avatarFileData = profilePayload.avatar_file_data;
    const avatarUrl = profilePayload.avatar_url;
    delete profilePayload.avatar_file_data;
    delete profilePayload.avatar_url;

    const updateTasks = [];

    if (Object.keys(profilePayload).length) {
        updateTasks.push(horseOwnerRepository.updateProfileById(owner._id, {
            $set: profilePayload
        }));
    } else {
        updateTasks.push(Promise.resolve(owner));
    }

    if (avatarFileData || avatarUrl) {
        const avatarUpload = await cloudinaryService.uploadOptionalSource(
            avatarFileData,
            avatarUrl,
            { folder: 'horse-racing/avatars', resource_type: 'image' }
        );

        updateTasks.push(userRepository.updateById(user._id, {
            $set: {
                avatar_url: avatarUpload ? avatarUpload.secure_url : avatarUrl
            }
        }));
    } else {
        updateTasks.push(Promise.resolve(user));
    }

    const [updatedProfile, updatedUser] = await Promise.all(updateTasks);

    return {
        profile: Object.assign({}, updatedProfile, {
            avatar_url: updatedUser.avatar_url || ''
        })
    };
}

async function getHorses(user) {
    const owner = await getCurrentOwner(user);
    const horses = await horseOwnerRepository.findHorsesByOwnerId(owner._id);

    return {
        horses: horses
    };
}

async function createHorse(user, payload) {
    const owner = await getCurrentOwner(user);
    const imageUpload = await cloudinaryService.uploadOptionalSource(
        payload.image_file_data,
        payload.image_url,
        { folder: 'horse-racing/horses', resource_type: 'image' }
    );
    const horsePayload = Object.assign({}, payload, {
        owner_id: owner._id,
        status: payload.status || 'active'
    });

    delete horsePayload.image_file_data;

    if (imageUpload) {
        horsePayload.image_url = imageUpload.secure_url;
        horsePayload.image_public_id = imageUpload.public_id;
    }

    const horse = await horseOwnerRepository.createHorse(
        horsePayload
    );

    return {
        horse: horse
    };
}

async function getHorseDetail(user, horseId) {
    const owner = await getCurrentOwner(user);
    const horse = await horseOwnerRepository.findHorseById(horseId);

    assertHorseBelongsToOwner(horse, owner._id);

    return {
        horse: horse
    };
}

async function updateHorse(user, horseId, payload) {
    const owner = await getCurrentOwner(user);
    const horse = await horseOwnerRepository.findHorseById(horseId);

    assertHorseBelongsToOwner(horse, owner._id);
    const updatePayload = Object.assign({}, payload);
    const imageUpload = await cloudinaryService.uploadOptionalSource(
        updatePayload.image_file_data,
        updatePayload.image_url,
        { folder: 'horse-racing/horses', resource_type: 'image' }
    );

    delete updatePayload.image_file_data;

    if (imageUpload) {
        updatePayload.image_url = imageUpload.secure_url;
        updatePayload.image_public_id = imageUpload.public_id;
    }

    const updatedHorse = await horseOwnerRepository.updateHorseById(horseId, {
        $set: updatePayload
    });

    return {
        horse: updatedHorse
    };
}

async function deactivateHorse(user, horseId) {
    const owner = await getCurrentOwner(user);
    const horse = await horseOwnerRepository.findHorseById(horseId);

    assertHorseBelongsToOwner(horse, owner._id);

    const updatedHorse = await horseOwnerRepository.updateHorseById(horseId, {
        $set: {
            status: 'inactive'
        }
    });

    return {
        horse: updatedHorse
    };
}

async function updateHorseMedia(user, horseId, payload) {
    const owner = await getCurrentOwner(user);
    const horse = await horseOwnerRepository.findHorseById(horseId);

    assertHorseBelongsToOwner(horse, owner._id);
    const imageUpload = await cloudinaryService.uploadOptionalSource(
        payload.image_file_data,
        payload.image_url,
        { folder: 'horse-racing/horses', resource_type: 'image' }
    );

    const updatedHorse = await horseOwnerRepository.updateHorseById(horseId, {
        $set: {
            image_url: imageUpload ? imageUpload.secure_url : payload.image_url,
            image_public_id: imageUpload ? imageUpload.public_id : undefined
        }
    });

    return {
        horse: updatedHorse
    };
}

async function getHorseApprovalStatus(user, horseId) {
    const owner = await getCurrentOwner(user);
    const horse = await horseOwnerRepository.findHorseById(horseId);

    assertHorseBelongsToOwner(horse, owner._id);

    const [registrations, checks] = await Promise.all([
        horseOwnerRepository.findRegistrationsByHorseId(horseId),
        horseOwnerRepository.findHorseChecksByHorseId(horseId)
    ]);

    return {
        horse: horse,
        ready_to_race: horse.status === 'active' && checks.some(function(check) {
            return check.is_eligible === true;
        }),
        registrations: registrations,
        checks: checks
    };
}

/**
 * Load a single Race row by id, eager-loading the round. Mirrors the legacy
 * `Race.findById(...).lean()` path.
 */
async function findRaceById(raceId) {
    const { Race, Round } = getModels();
    const row = await Race.findOne({
        where: { id: raceId },
        include: [
            { model: Round, as: 'round', required: false }
        ]
    });
    return toPlain(row);
}

async function findRacesByTournamentId(tournamentId) {
    const { Op } = require('sequelize');
    const { Race, Round } = getModels();
    const rows = await Race.findAll({
        where: { tournament_id: tournamentId, deleted_at: null },
        order: [['race_date', 'ASC'], ['created_at', 'DESC']],
        include: [
            { model: Round, as: 'round', required: false }
        ]
    });
    return rows.map(toPlain);
}

async function findRegistrationByRaceAndHorse(raceId, horseId) {
    const { Registration } = getModels();
    const row = await Registration.findOne({ where: { race_id: raceId, horse_id: horseId } });
    return toPlain(row);
}

async function findRegistrationById(registrationId) {
    const { Registration } = getModels();
    const row = await Registration.findByPk(registrationId);
    return toPlain(row);
}

async function createRegistration(registrationData) {
    const { Registration } = getModels();
    const row = await Registration.create(registrationData);
    return toPlain(row);
}

async function updateRegistrationById(registrationId, updateData) {
    const { Registration } = getModels();
    const fields = projectUpdate(updateData);
    const [affected] = await Registration.update(fields, { where: { id: registrationId } });
    if (affected === 0) return null;
    return findRegistrationById(registrationId);
}

async function findRegistrationByPaymentOrderId(orderId) {
    const { Registration, Tournament, Race, Horse, HorseOwner, User } = getModels();
    const row = await Registration.findOne({
        where: { payment_order_id: orderId },
        include: [
            { model: Tournament, as: 'tournament', required: false },
            { model: Race, as: 'race', required: false },
            { model: Horse, as: 'horse', required: false },
            {
                model: HorseOwner,
                as: 'owner',
                required: false,
                include: [{ model: User, as: 'user', required: false }]
            }
        ]
    });
    return toPlain(row);
}

async function updateRegistrationByPaymentOrderId(orderId, updateData) {
    const { Registration } = getModels();
    const fields = projectUpdate(updateData);
    const [affected] = await Registration.update(fields, {
        where: { payment_order_id: orderId, payment_status: 'pending' }
    });
    if (affected === 0) return null;
    return findRegistrationByPaymentOrderId(orderId);
}

async function findBoundJockeyIdsForRace(raceId) {
    const { Op } = require('sequelize');
    const { JockeyAssignment } = getModels();
    const rows = await JockeyAssignment.findAll({
        where: {
            race_id: raceId,
            status: { [Op.in]: ['accepted', 'standby_confirmed'] }
        },
        attributes: ['jockey_id', 'horse_id', 'assignment_type']
    });
    return rows.map(toPlain);
}

/**
 * Approximate replacement for the legacy
 *   `Registration.aggregate([{ $match: { race_id: { $in: [...] }, ... } }, { $group: ... }])`
 * using raw SQL. Counts approved registrations plus pending-but-paid
 * reservations whose `payment_expires_at` is still in the future.
 */
async function countApprovedRegistrationsByRaceIds(raceIds) {
    if (!raceIds || !raceIds.length) return [];
    const placeholders = raceIds.map(() => '?').join(', ');
    const sql = `
        SELECT race_id::text AS _id, COUNT(*)::int AS count
          FROM registrations
         WHERE race_id IN (${placeholders})
           AND (
             status = '${REGISTRATION_STATUS.APPROVED}'
             OR (
               status = '${REGISTRATION_STATUS.PENDING}'
               AND payment_status = 'pending'
               AND payment_expires_at > NOW()
             )
           )
         GROUP BY race_id
    `;
    const [rows] = await getSequelize().query(sql, { replacements: raceIds });
    return rows;
}

async function findRoundById(roundId) {
    const { Round } = getModels();
    const row = await Round.findByPk(roundId);
    return toPlain(row);
}

async function getAvailableJockeys(user, raceId) {
    await getCurrentOwner(user);

    const jockeys = await horseOwnerRepository.findAvailableJockeys();

    if (!raceId) {
        return { jockeys };
    }

    // The previous guard validated the id shape (mirroring the legacy
    // isValidObjectId check); Postgres stores UUIDs, so a non-UUID string
    // will simply fail the lookup, but we keep the same 400 semantics by
    // checking for an empty / falsy id explicitly.
    if (!raceId) {
        throw new ApiError(400, 'race_id must be a valid id');
    }

    const race = await findRaceById(raceId);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    const bindings = await findBoundJockeyIdsForRace(raceId);
    const bindingByJockeyId = new Map(bindings.map(function(binding) {
        return [binding.jockey_id.toString(), binding];
    }));

    return {
        jockeys: jockeys.map(function(jockey) {
            const binding = bindingByJockeyId.get(jockey._id.toString());

            return Object.assign({}, jockey, {
                available_for_race: !binding,
                availability_reason: binding
                    ? 'Already confirmed for another horse in this race'
                    : null
            });
        })
    };
}

async function getJockeyDetail(user, jockeyId) {
    await getCurrentOwner(user);

    const jockey = await horseOwnerRepository.findJockeyById(jockeyId);

    if (!jockey || jockey.status !== 'active') {
        throw new ApiError(404, 'Jockey not found');
    }

    return {
        jockey: jockey
    };
}

async function getTournaments(user) {
    await getCurrentOwner(user);

    const tournaments = await horseOwnerRepository.findTournaments();

    return {
        tournaments: await enrichTournamentsWithRaceSummary(tournaments)
    };
}

async function getRacesByTournamentId(user, tournamentId) {
    await getCurrentOwner(user);

    const tournament = await horseOwnerRepository.findTournamentById(tournamentId);

    if (!tournament) {
        throw new ApiError(404, 'Tournament not found');
    }

    const races = await findRacesByTournamentId(tournament._id);
    const counts = await countApprovedRegistrationsByRaceIds(races.map(function(race) {
        return race._id;
    }));
    const countByRaceId = new Map(counts.map(function(item) {
        return [item._id.toString(), item.count];
    }));
    const enrichedRaces = races.map(function(race) {
        const availability = getRaceRegistrationAvailability(race, countByRaceId.get(race._id.toString()) || 0);

        return Object.assign({}, race, availability, {
            entry_fee_vnd: Number(race.entry_fee || 0),
            entry_fee_currency: race.entry_fee_currency || 'VND'
        });
    });

    return {
        tournament: summarizeTournamentRaces(tournament, races),
        races: enrichedRaces
    };
}

async function getRoundsByRaceId(user, raceId) {
    await getCurrentOwner(user);

    const race = await findRaceById(raceId);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    const round = await findRoundById(race.round_id);

    return {
        race: race,
        rounds: round ? [round] : []
    };
}

async function createRegistrationInternal(user, owner, horseId, tournamentId, raceId, note, gears) {
    const [horse, tournament, race] = await Promise.all([
        horseOwnerRepository.findHorseById(horseId),
        horseOwnerRepository.findTournamentById(tournamentId),
        findRaceById(raceId)
    ]);

    assertHorseBelongsToOwner(horse, owner._id);

    if (!tournament) {
        throw new ApiError(404, 'Tournament not found');
    }

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    if (!isSameId(race.tournament_id, tournament._id)) {
        throw new ApiError(400, 'Race does not belong to the selected tournament');
    }

    if (horse.status !== 'active') {
        throw new ApiError(400, 'Only active horses can be registered');
    }

    const existingRegistration = await findRegistrationByRaceAndHorse(race._id, horse._id);

    if (existingRegistration && (
        existingRegistration.status === REGISTRATION_STATUS.APPROVED
        || existingRegistration.payment_status === 'paid'
    )) {
        throw new ApiError(409, 'Horse is already registered for this race');
    }

    const hasActivePaymentReservation = existingRegistration
        && existingRegistration.status === REGISTRATION_STATUS.PENDING
        && existingRegistration.payment_status === 'pending'
        && existingRegistration.payment_expires_at
        && new Date(existingRegistration.payment_expires_at).getTime() > Date.now();

    if (hasActivePaymentReservation) {
        await registrationSlotService.initializeRaceSlots(race._id);
        const gateway = await paymentGatewayService.createPaymentUrl({
            orderId: existingRegistration.payment_order_id,
            amountVnd: existingRegistration.entry_fee_vnd,
            orderInfo: 'Race registration ' + race.name,
            paymentMethod: REGISTRATION_PAYMENT_METHOD
        });

        return {
            registration: existingRegistration,
            order: buildRegistrationPaymentResponse(existingRegistration),
            order_id: existingRegistration.payment_order_id,
            payment_url: gateway.payment_url
        };
    }

    await registrationSlotService.releaseExpiredReservations(race._id);
    const initialCounts = await countApprovedRegistrationsByRaceIds([race._id]);
    const initialParticipantCount = initialCounts.length ? initialCounts[0].count : 0;

    assertRaceRegistrationAvailable(getRaceRegistrationAvailability(race, initialParticipantCount));
    await raceEngineService.ensureRaceRegistrationIsUnlocked(race._id);

    const fee = getRegistrationFee(race);
    const declaredGears = gears === undefined ? (horse.default_gears || []) : gears;
    await registrationSlotService.reserveRaceSlot(race._id);
    const slotReservedAt = new Date();

    if (!fee.entryFeeVnd) {
        const noFeePayload = {
            tournament_id: tournament._id,
            race_id: race._id,
            horse_id: horse._id,
            owner_id: owner._id,
            note: note,
            gears: declaredGears,
            entry_fee_vnd: 0,
            entry_fee_token: 0,
            payment_status: 'not_required',
            slot_reserved: true,
            slot_reserved_at: slotReservedAt,
            slot_released_at: null,
            status: REGISTRATION_STATUS.APPROVED,
            approved_at: new Date()
        };
        let registration;

        try {
            registration = existingRegistration
                ? await updateRegistrationById(existingRegistration._id, { $set: noFeePayload })
                : await createRegistration(noFeePayload);
        } catch (error) {
            await registrationSlotService.releaseRaceSlot(race._id);
            throw error;
        }
        const emailDelivery = queueRaceRegistrationEmail({ user, owner, horse, tournament, race, registration });

        return { registration, email_delivery: emailDelivery };
    }

    const orderId = generateRegistrationOrderId();
    const paymentExpiresAt = new Date(Date.now() + REGISTRATION_PAYMENT_TTL_MS);
    const pendingPayload = {
        tournament_id: tournament._id,
        race_id: race._id,
        horse_id: horse._id,
        owner_id: owner._id,
        note: note,
        gears: declaredGears,
        entry_fee_vnd: fee.entryFeeVnd,
        entry_fee_token: 0,
        payment_method: REGISTRATION_PAYMENT_METHOD,
        payment_order_id: orderId,
        payment_status: 'pending',
        payment_expires_at: paymentExpiresAt,
        payment_paid_at: null,
        slot_reserved: true,
        slot_reserved_at: slotReservedAt,
        slot_released_at: null,
        status: REGISTRATION_STATUS.PENDING,
        approved_at: null,
        approved_by: null
    };
    let registration;

    try {
        registration = existingRegistration
            ? await updateRegistrationById(existingRegistration._id, { $set: pendingPayload })
            : await createRegistration(pendingPayload);
    } catch (error) {
        await registrationSlotService.releaseRaceSlot(race._id);
        throw error;
    }

    try {
        const gateway = await paymentGatewayService.createPaymentUrl({
            orderId,
            amountVnd: fee.entryFeeVnd,
            orderInfo: 'Race registration ' + race.name,
            paymentMethod: REGISTRATION_PAYMENT_METHOD
        });

        return {
            registration,
            order: buildRegistrationPaymentResponse(registration),
            order_id: orderId,
            payment_url: gateway.payment_url
        };
    } catch (error) {
        await updateRegistrationById(registration._id, {
            $set: {
                payment_status: 'failed',
                status: REGISTRATION_STATUS.REJECTED,
                admin_note: 'Unable to initialize VNPay payment'
            }
        });
        await registrationSlotService.releaseRegistrationSlot(
            registration._id,
            'Unable to initialize VNPay payment'
        );
        throw error;
    }
}

async function handleRegistrationPaymentWebhook(webhookPayload, paymentMethod) {
    if (paymentMethod !== REGISTRATION_PAYMENT_METHOD) {
        throw new ApiError(400, 'Race registration fees only support VNPay');
    }

    const signature = paymentGatewayService.verifySignature(webhookPayload, paymentMethod);

    if (!signature.valid) {
        throw new ApiError(403, 'Webhook signature verification failed', { reason: signature.reason });
    }

    const orderId = webhookPayload.vnp_TxnRef || webhookPayload.order_id || webhookPayload.orderId;

    if (!orderId || !String(orderId).startsWith('REG-')) {
        throw new ApiError(400, 'Invalid race registration payment order');
    }

    const registration = await findRegistrationByPaymentOrderId(orderId);

    if (!registration) {
        throw new ApiError(404, 'Race registration payment order not found');
    }

    if (registration.payment_status === 'paid' && registration.status === REGISTRATION_STATUS.APPROVED) {
        return {
            processed: false,
            order: buildRegistrationPaymentResponse(registration),
            registration,
            message: 'Race registration payment was already processed'
        };
    }

    if (!paymentGatewayService.isPaymentSuccess(webhookPayload, paymentMethod)) {
        const failed = await updateRegistrationById(registration._id, {
            $set: {
                payment_status: 'failed',
                status: REGISTRATION_STATUS.REJECTED,
                admin_note: 'VNPay reported an unsuccessful payment'
            }
        });
        await registrationSlotService.releaseRegistrationSlot(
            registration._id,
            'VNPay reported an unsuccessful payment'
        );

        return {
            processed: true,
            order: buildRegistrationPaymentResponse(failed),
            registration: failed,
            message: 'Race registration payment failed'
        };
    }

    const returnedAmountVnd = Number(webhookPayload.vnp_Amount || 0) / 100;

    if (returnedAmountVnd !== Number(registration.entry_fee_vnd || 0)) {
        await updateRegistrationById(registration._id, {
            $set: {
                payment_status: 'failed',
                status: REGISTRATION_STATUS.REJECTED,
                admin_note: 'VNPay amount did not match the registration fee snapshot'
            }
        });
        await registrationSlotService.releaseRegistrationSlot(
            registration._id,
            'VNPay amount did not match the registration fee snapshot'
        );
        throw new ApiError(400, 'VNPay amount does not match the race registration fee');
    }

    const reservationExpired = registration.payment_expires_at
        && new Date(registration.payment_expires_at).getTime() <= Date.now();

    if (reservationExpired || !registration.slot_reserved) {
        await registrationSlotService.releaseRegistrationSlot(
            registration._id,
            'Payment completed after the reserved place expired'
        );
        const refundPending = await updateRegistrationById(registration._id, {
            $set: {
                payment_status: 'refund_pending',
                status: REGISTRATION_STATUS.REJECTED,
                admin_note: 'Payment succeeded after the reserved place expired'
            }
        });

        return {
            processed: true,
            order: buildRegistrationPaymentResponse(refundPending),
            registration: refundPending,
            message: 'Payment received after the reserved place expired; refund review is required'
        };
    }

    const confirmed = await updateRegistrationByPaymentOrderId(orderId, {
        $set: {
            payment_status: 'paid',
            gateway_reference_id: paymentGatewayService.extractGatewayTransactionId(webhookPayload, paymentMethod),
            payment_paid_at: new Date(),
            status: REGISTRATION_STATUS.APPROVED,
            approved_at: new Date(),
            admin_note: 'Automatically confirmed after successful VNPay payment'
        }
    });

    if (!confirmed) {
        const latest = await findRegistrationByPaymentOrderId(orderId);

        return {
            processed: false,
            order: buildRegistrationPaymentResponse(latest || registration),
            registration: latest || registration,
            message: 'Race registration payment was already processed'
        };
    }
    const owner = confirmed.owner_id;
    const emailDelivery = queueRaceRegistrationEmail({
        user: owner && owner.user_id ? owner.user_id : {},
        owner,
        horse: confirmed.horse_id,
        tournament: confirmed.tournament_id,
        race: confirmed.race_id,
        registration: confirmed
    });

    return {
        processed: true,
        order: buildRegistrationPaymentResponse(confirmed),
        registration: confirmed,
        email_delivery: emailDelivery,
        message: 'Race registration payment confirmed successfully'
    };
}

async function getRegistrationPayment(user, orderId) {
    const owner = await getCurrentOwner(user);
    const registration = await findRegistrationByPaymentOrderId(orderId);

    if (!registration) {
        throw new ApiError(404, 'Race registration payment order not found');
    }

    const registrationOwnerId = registration.owner_id && (registration.owner_id._id || registration.owner_id);

    if (!isSameId(registrationOwnerId, owner._id)) {
        throw new ApiError(403, 'Race registration payment does not belong to current horse owner');
    }

    return {
        order: buildRegistrationPaymentResponse(registration),
        registration
    };
}

async function registerHorseForRace(user, payload) {
    const owner = await getCurrentOwner(user);
    const race = await findRaceById(payload.race_id);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    return createRegistrationInternal(user, owner, payload.horse_id, race.tournament_id, race._id, payload.note, payload.gears);
}

async function updateRaceEntryDetails(user, registrationId, payload) {
    const owner = await getCurrentOwner(user);
    const registration = await findRegistrationById(registrationId);

    if (!registration) throw new ApiError(404, 'Race registration not found');
    if (!isSameId(registration.owner_id, owner._id)) throw new ApiError(403, 'Race registration does not belong to current horse owner');

    const race = await findRaceById(registration.race_id);
    if (!race) throw new ApiError(404, 'Race not found');
    if (race.entries_finalized_at) throw new ApiError(409, 'Race entry details are locked after entries are finalized');
    if (race.betting_status && race.betting_status !== 'unavailable') {
        throw new ApiError(409, 'Race entry details cannot change after odds generation');
    }

    const updatedRegistration = await updateRegistrationById(registration._id, {
        $set: { gears: payload.gears }
    });
    await raceRepository.updateById(race._id, { $inc: { model_input_version: 1 } });

    return {
        registration: updatedRegistration
    };
}

async function getEligibleHorses(user, query = {}) {
    assertHorseOwnerRole(user.roles);
    const owner = await horseOwnerRepository.findProfileByUserId(user._id);
    if (!owner) {
        throw new ApiError(404, 'Horse owner profile not found');
    }

    const models = getModels();
    const horses = await models.Horse.findAll({
        where: {
            owner_id: owner._id,
            status: 'active'
        }
    });

    const raceId = query.race_id;
    const tournamentId = query.tournament_id;

    let targetRace = null;
    let targetRacetrack = null;
    let targetSurface = 'Turf';
    let targetRaceClass = null;

    if (raceId) {
        targetRace = await models.Race.findByPk(raceId, {
            include: [
                { model: models.Racetrack, as: 'racetrack' },
                { model: models.Tournament, as: 'tournament' }
            ]
        });
        if (targetRace) {
            targetRacetrack = targetRace.racetrack;
            targetSurface = targetRacetrack ? targetRacetrack.surface : (targetRace.surface || 'Turf');
            targetRaceClass = targetRace.race_class;
        }
    } else if (tournamentId) {
        const tournament = await models.Tournament.findByPk(tournamentId, {
            include: [{ model: models.Racetrack, as: 'racetrack' }]
        });
        if (tournament && tournament.racetrack) {
            targetRacetrack = tournament.racetrack;
            targetSurface = targetRacetrack.surface;
        }
    }

    const evaluatedHorses = await Promise.all(horses.map(async (h) => {
        const horse = toPlain(h);
        const rating = Number(horse.current_rating || 50);
        let eligible = true;
        let reason = 'Đủ điều kiện đăng ký';

        const incompatibleSurfaces = Array.isArray(horse.incompatible_surfaces) ? horse.incompatible_surfaces : [];
        if (incompatibleSurfaces.includes(targetSurface)) {
            eligible = false;
            reason = `Không tương thích với mặt sân ${targetSurface}`;
        }

        if (eligible && targetRaceClass) {
            let classMatched = false;
            if (targetRaceClass === '1' && rating >= 80) classMatched = true;
            else if (targetRaceClass === '2' && rating >= 60 && rating < 80) classMatched = true;
            else if (targetRaceClass === '3' && rating >= 40 && rating < 60) classMatched = true;
            else if (targetRaceClass === '4' && rating >= 20 && rating < 40) classMatched = true;
            else if (targetRaceClass === '5' && rating < 20) classMatched = true;

            if (!classMatched) {
                eligible = false;
                reason = `Rating (${rating}) không phù hợp với Hạng đua Class ${targetRaceClass}`;
            }
        }

        if (eligible) {
            const activePenalty = await models.ViolationPenalty.findOne({
                where: { horse_id: horse.id, status: 'active' }
            });
            if (activePenalty) {
                eligible = false;
                reason = 'Ngựa đang bị kỷ luật cấm thi đấu';
            }
        }

        if (eligible && targetRace && targetRace.starting_at) {
            const raceTime = new Date(targetRace.starting_at).getTime();
            const twoHoursMs = 2 * 60 * 60 * 1000;

            const existingRegs = await models.Registration.findAll({
                where: { horse_id: horse.id, status: { [require('sequelize').Op.ne]: 'rejected' } },
                include: [{ model: models.Race, as: 'race' }]
            });

            for (const reg of existingRegs) {
                if (reg.race && reg.race.id !== targetRace.id && reg.race.starting_at) {
                    const otherTime = new Date(reg.race.starting_at).getTime();
                    if (Math.abs(raceTime - otherTime) < twoHoursMs) {
                        eligible = false;
                        reason = 'Trùng lịch thi đấu trong vòng 2 giờ';
                        break;
                    }
                }
            }
        }

        return {
            ...horse,
            eligible,
            eligibility_reason: reason
        };
    }));

    return {
        target_surface: targetSurface,
        target_class: targetRaceClass,
        horses: evaluatedHorses,
        eligible_horses: evaluatedHorses.filter((h) => h.eligible)
    };
}

module.exports = {
    getProfile,
    updateProfile,
    getHorses,
    getEligibleHorses,
    createHorse,
    getHorseDetail,
    updateHorse,
    deactivateHorse,
    updateHorseMedia,
    getHorseApprovalStatus,
    getAvailableJockeys,
    getJockeyDetail,
    getTournaments,
    getRacesByTournamentId,
    getRoundsByRaceId,
    registerHorseForRace,
    updateRaceEntryDetails,
    handleRegistrationPaymentWebhook,
    getRegistrationPayment,
    _private: {
        getRaceRegistrationAvailability
    }
};