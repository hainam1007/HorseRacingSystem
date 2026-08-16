'use strict';

/**
 * registrationCancellationTicketService — Sequelize/PostgreSQL implementation.
 *
 * Business logic and API response shape preserved from the legacy
 * service.
 *
 * Legacy-ORM concepts translated to Sequelize:
 *   - `Model.findById(id).lean()` → `Model.findByPk(id)` (+ `toPlain`).
 *   - `Model.findOne({...})` → `Model.findOne({ where })`.
 *   - `Model.findOneAndUpdate(filter, $set: ..., { returnDocument: 'after' })` →
 *     `Model.update(fields, { where })` + reload (or `upsert` semantics).
 *   - `Model.updateMany(filter, $set: ...)` → `Model.update(fields, { where })`.
 *   - `Model.countDocuments({...})` → `Model.count({ where })`.
 *   - Reads/writes that previously passed a per-query session are translated
 *     by lifting the read+write inside a `sequelize.transaction()` callback;
 *     per-query session options are dropped.
 *   - Transactional flow: the legacy `session.withTransaction(...)` pattern
 *     is replaced by `sequelize.transaction()`.
 *   - `.populate(...)` reads in the original code went through
 *     `ticketRepository.findById`. We now call `loadTicketById(id)` below,
 *     which eager-loads the related rows via Sequelize `include:`.
 */

const ApiError = require('../utils/ApiError');
const {
    ASSIGNMENT_STATUS,
    CANCELLATION_TICKET_STATUS,
    ODDS_MARKET_STATUS,
    REFUND_STATUS,
    REGISTRATION_STATUS
} = require('../constants/statuses');
const profileRepository = require('../repositories/profileRepository');
const ticketRepository = require('../repositories/registrationCancellationTicketRepository');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { toPlain, projectUpdate } = require('../repositories/sequelize/adapter');

const CLOSED_RACE_STATUSES = [
    'started',
    'starting',
    'running',
    'ongoing',
    'in_progress',
    'completed',
    'finished',
    'cancelled',
    'canceled',
    'deleted'
];
const CANCELLABLE_REGISTRATION_PAYMENT_STATUSES = ['paid', 'not_required'];

function getModels() {
    return loadSequelizeModels().models;
}

function getSequelize() {
    return loadSequelizeModels().sequelize;
}

function sameId(first, second) {
    return first && second && first.toString() === second.toString();
}

function getRaceStartTime(race) {
    const time = race && race.race_date
        ? new Date(race.race_date).getTime()
        : Number.NaN;

    return Number.isNaN(time) ? null : time;
}

function assertCancellationWindowOpen(race) {
    const startTime = getRaceStartTime(race);

    if (!startTime) {
        throw new ApiError(409, 'Race start date is required before cancellation can be requested');
    }

    if (Date.now() >= startTime) {
        throw new ApiError(409, 'Cancellation requests must be completed before the race starts');
    }

    if (CLOSED_RACE_STATUSES.includes(String(race.status || '').toLowerCase())) {
        throw new ApiError(409, 'This race can no longer be cancelled');
    }
}

async function getOwnerOrThrow(userId) {
    const owner = await profileRepository.findHorseOwnerByUserId(userId);

    if (!owner) {
        throw new ApiError(404, 'Horse owner profile not found');
    }

    return owner;
}

async function loadTicketById(ticketId) {
    const {
        RegistrationCancellationTicket,
        Registration,
        Tournament,
        Race,
        Horse,
        HorseOwner,
        User
    } = getModels();

    const row = await RegistrationCancellationTicket.findOne({
        where: { id: ticketId },
        include: [
            { model: Registration, as: 'registration', required: false },
            { model: Tournament, as: 'tournament', required: false },
            { model: Race, as: 'race', required: false },
            { model: Horse, as: 'horse', required: false },
            { model: HorseOwner, as: 'owner', required: false },
            { model: User, as: 'reviewer', required: false, attributes: ['id', 'full_name', 'email'] },
            { model: User, as: 'refund_sender', required: false, attributes: ['id', 'full_name', 'email'] }
        ]
    });

    return toPlain(row);
}

async function createTicket(userId, payload) {
    const owner = await getOwnerOrThrow(userId);
    const { Registration } = getModels();
    const registration = toPlain(await Registration.findByPk(payload.registration_id));

    if (!registration) {
        throw new ApiError(404, 'Race registration not found');
    }

    if (!sameId(registration.owner_id, owner._id)) {
        throw new ApiError(403, 'Race registration does not belong to current horse owner');
    }

    if (registration.status !== REGISTRATION_STATUS.APPROVED) {
        throw new ApiError(409, 'Only confirmed race registrations can be cancelled');
    }

    if (!CANCELLABLE_REGISTRATION_PAYMENT_STATUSES.includes(registration.payment_status)) {
        throw new ApiError(409, 'Registration payment must be completed before cancellation is requested');
    }

    const { Tournament, Race } = getModels();
    const [tournament, race] = await Promise.all([
        Tournament.findByPk(registration.tournament_id).then((row) => toPlain(row)),
        Race.findByPk(registration.race_id).then((row) => toPlain(row))
    ]);

    if (!tournament || !race) {
        throw new ApiError(404, 'Tournament or race not found');
    }

    assertCancellationWindowOpen(race);

    try {
        const ticket = await ticketRepository.create({
            registration_id: registration._id,
            tournament_id: registration.tournament_id,
            race_id: registration.race_id,
            owner_id: owner._id,
            horse_id: registration.horse_id,
            reason: payload.reason,
            status: CANCELLATION_TICKET_STATUS.PENDING,
            refund_status: registration.payment_status === 'paid'
                ? REFUND_STATUS.AWAITING_APPROVAL
                : REFUND_STATUS.NOT_REQUIRED,
            refund_amount_vnd: registration.payment_status === 'paid'
                ? Number(registration.entry_fee_vnd || 0)
                : 0,
            requested_at: new Date()
        });

        return {
            cancellation_ticket: await loadTicketById(ticket._id || ticket.id)
        };
    } catch (error) {
        if (error && (error.code === '23505' || error.original?.code === '23505')) {
            throw new ApiError(409, 'A pending cancellation ticket already exists for this registration');
        }

        throw error;
    }
}

async function listOwnerTickets(userId, query) {
    const owner = await getOwnerOrThrow(userId);

    return {
        cancellation_tickets: await ticketRepository.find(
            Object.assign({ owner_id: owner._id }, query || {})
        )
    };
}

async function getOwnerTicket(userId, ticketId) {
    const owner = await getOwnerOrThrow(userId);
    const ticket = await loadTicketById(ticketId);

    if (!ticket) {
        throw new ApiError(404, 'Cancellation ticket not found');
    }

    if (!sameId(ticket.owner_id && (ticket.owner_id._id || ticket.owner_id), owner._id)) {
        throw new ApiError(403, 'Cancellation ticket does not belong to current horse owner');
    }

    return { cancellation_ticket: ticket };
}

async function listAdminTickets(query) {
    return {
        cancellation_tickets: await ticketRepository.find(query || {})
    };
}

async function getAdminTicket(ticketId) {
    const ticket = await loadTicketById(ticketId);

    if (!ticket) {
        throw new ApiError(404, 'Cancellation ticket not found');
    }

    return { cancellation_ticket: ticket };
}

async function approveTicket(adminUserId, ticketId, payload) {
    const { Op } = require('sequelize');
    const sequelize = getSequelize();

    await sequelize.transaction(async () => {
        const {
            RegistrationCancellationTicket,
            Registration,
            Race,
            JockeyAssignment,
            RaceOddsMarket
        } = getModels();

        const ticket = await RegistrationCancellationTicket.findOne({
            where: {
                id: ticketId,
                status: CANCELLATION_TICKET_STATUS.PENDING
            }
        });

        if (!ticket) {
            throw new ApiError(409, 'Only pending cancellation tickets can be approved');
        }

        const registration = await Registration.findByPk(ticket.registration_id);
        const tournament = await (async () => {
            const { Tournament } = getModels();
            return Tournament.findByPk(ticket.tournament_id);
        })();
        const race = await Race.findByPk(ticket.race_id);

        if (!registration || !tournament || !race) {
            throw new ApiError(404, 'Cancellation ticket registration data is incomplete');
        }

        assertCancellationWindowOpen(toPlain(race));

        if (registration.status !== REGISTRATION_STATUS.APPROVED) {
            throw new ApiError(409, 'Race registration is no longer confirmed');
        }

        if (
            [
                ODDS_MARKET_STATUS.OPEN,
                ODDS_MARKET_STATUS.CLOSED,
                ODDS_MARKET_STATUS.SETTLED
            ].includes(race.betting_status)
        ) {
            throw new ApiError(409, 'Cancellation cannot be approved after race betting opens');
        }

        const raceBetCount = await getModels().Bet.count({ where: { race_id: race.id } });

        if (raceBetCount > 0) {
            throw new ApiError(409, 'Cancellation cannot be approved after bets are placed');
        }

        const paidRegistration = registration.payment_status === 'paid';
        const hadReservedSlot = registration.slot_reserved === true;
        const now = new Date();

        const registrationUpdate = {
            status: REGISTRATION_STATUS.CANCELLED,
            slot_reserved: false,
            slot_released_at: now
        };
        if (paidRegistration) {
            registrationUpdate.payment_status = 'refund_pending';
        }
        await Registration.update(registrationUpdate, { where: { id: registration.id } });

        const raceUpdate = {
            model_input_version: Number(race.model_input_version || 0) + 1
        };
        if (hadReservedSlot && Number(race.registration_slot_count || 0) > 0) {
            raceUpdate.registration_slot_count = Math.max(0, Number(race.registration_slot_count || 0) - 1);
        }
        if (race.betting_status === ODDS_MARKET_STATUS.GENERATED) {
            raceUpdate.betting_status = ODDS_MARKET_STATUS.STALE;
            // betting_market.status is a JSONB sub-doc; update via raw SQL.
        }
        await Race.update(raceUpdate, { where: { id: race.id } });

        if (
            race.betting_status === ODDS_MARKET_STATUS.GENERATED
            || raceUpdate.betting_status === ODDS_MARKET_STATUS.STALE
        ) {
            await getSequelize().query(
                `UPDATE races
                    SET betting_market = jsonb_set(
                        COALESCE(betting_market, '{}'::jsonb),
                        '{status}',
                        '"stale"'::jsonb,
                        true
                    )
                  WHERE id = ?`,
                { replacements: [race.id] }
            );
        }

        await JockeyAssignment.update({
            status: ASSIGNMENT_STATUS.CANCELLED,
            response_message: 'Race registration cancellation approved by admin',
            responded_at: now
        }, {
            where: {
                race_id: race.id,
                horse_id: registration.horse_id,
                status: {
                    [Op.notIn]: [
                        ASSIGNMENT_STATUS.CANCELLED,
                        ASSIGNMENT_STATUS.REJECTED,
                        ASSIGNMENT_STATUS.REPLACED
                    ]
                }
            }
        });

        await RaceOddsMarket.update({
            status: ODDS_MARKET_STATUS.STALE
        }, {
            where: {
                race_id: race.id,
                status: ODDS_MARKET_STATUS.GENERATED
            }
        });

        const ticketUpdate = {
            status: CANCELLATION_TICKET_STATUS.APPROVED,
            reviewed_by: adminUserId,
            reviewed_at: now,
            admin_note: payload.admin_note,
            refund_status: paidRegistration
                ? REFUND_STATUS.PENDING
                : REFUND_STATUS.NOT_REQUIRED,
            refund_amount_vnd: paidRegistration
                ? Number(registration.entry_fee_vnd || 0)
                : 0
        };
        await RegistrationCancellationTicket.update(ticketUpdate, { where: { id: ticket.id } });
    });

    return getAdminTicket(ticketId);
}

async function rejectTicket(adminUserId, ticketId, payload) {
    const { RegistrationCancellationTicket } = getModels();

    const [affected] = await RegistrationCancellationTicket.update({
        status: CANCELLATION_TICKET_STATUS.REJECTED,
        reviewed_by: adminUserId,
        reviewed_at: new Date(),
        admin_note: payload.admin_note,
        refund_status: REFUND_STATUS.NOT_REQUIRED
    }, {
        where: {
            id: ticketId,
            status: CANCELLATION_TICKET_STATUS.PENDING
        }
    });

    if (affected === 0) {
        throw new ApiError(409, 'Only pending cancellation tickets can be rejected');
    }

    return getAdminTicket(ticketId);
}

async function markRefundSent(adminUserId, ticketId, payload) {
    const sequelize = getSequelize();

    await sequelize.transaction(async () => {
        const { RegistrationCancellationTicket, Registration } = getModels();

        const ticket = await RegistrationCancellationTicket.findOne({
            where: {
                id: ticketId,
                status: CANCELLATION_TICKET_STATUS.APPROVED,
                refund_status: REFUND_STATUS.PENDING
            }
        });

        if (!ticket) {
            throw new ApiError(409, 'Only approved tickets with a pending refund can be marked as sent');
        }

        const registration = await Registration.findByPk(ticket.registration_id);

        if (!registration || registration.payment_status !== 'refund_pending') {
            throw new ApiError(409, 'Registration refund is not pending');
        }

        const now = new Date();
        await Registration.update({
            payment_status: 'refund_sent'
        }, { where: { id: registration.id } });

        const updateFields = {
            refund_status: REFUND_STATUS.AWAITING_OWNER_CONFIRMATION,
            refund_reference: payload.refund_reference,
            refund_sent_by: adminUserId,
            refund_sent_at: now
        };
        if (payload.admin_note) {
            updateFields.admin_note = payload.admin_note;
        }
        await RegistrationCancellationTicket.update(updateFields, { where: { id: ticket.id } });
    });

    return getAdminTicket(ticketId);
}

async function confirmRefundReceipt(userId, ticketId, payload) {
    const owner = await getOwnerOrThrow(userId);
    const sequelize = getSequelize();

    await sequelize.transaction(async () => {
        const { RegistrationCancellationTicket, Registration } = getModels();

        const ticket = await RegistrationCancellationTicket.findOne({
            where: {
                id: ticketId,
                owner_id: owner._id,
                status: CANCELLATION_TICKET_STATUS.APPROVED,
                refund_status: REFUND_STATUS.AWAITING_OWNER_CONFIRMATION
            }
        });

        if (!ticket) {
            throw new ApiError(
                409,
                'Only a refund awaiting owner confirmation can be confirmed'
            );
        }

        const registration = await Registration.findByPk(ticket.registration_id);

        if (!registration || registration.payment_status !== 'refund_sent') {
            throw new ApiError(409, 'Registration refund has not been marked as sent');
        }

        const now = new Date();
        await Registration.update({
            payment_status: 'refunded',
            payment_refunded_at: now
        }, { where: { id: registration.id } });

        await RegistrationCancellationTicket.update({
            refund_status: REFUND_STATUS.COMPLETED,
            owner_confirmed_at: now,
            owner_confirmation_note: payload.confirmation_note
        }, { where: { id: ticket.id } });
    });

    return getOwnerTicket(userId, ticketId);
}

module.exports = {
    approveTicket,
    confirmRefundReceipt,
    createTicket,
    getAdminTicket,
    getOwnerTicket,
    listAdminTickets,
    listOwnerTickets,
    markRefundSent,
    rejectTicket
};