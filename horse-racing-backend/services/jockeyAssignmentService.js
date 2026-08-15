'use strict';

/**
 * jockeyAssignmentService — Sequelize/PostgreSQL implementation.
 *
 * Business logic and API response shape preserved from the legacy
 * service.
 *
 * Legacy-ORM concepts translated to Sequelize:
 *   - `Model.find({...})` → `Model.findAll({ where: {...} })`.
 *   - `Model.findById(id)` → `Model.findByPk(id)`.
 *   - `Model.findOne({...})` → `Model.findOne({ where: {...} })`.
 *   - `Model.findOneAndUpdate({...}, $set: {...}, { returnDocument: 'after' })` →
 *     `Model.update(setFields, { where, returning: true })` + reload.
 *   - `Model.findByIdAndUpdate(id, $set: {...}, { returnDocument: 'after' })` →
 *     `Model.update(setFields, { where: { id }, returning: true })` + reload.
 *   - `populate({ path: ..., populate: { path: ... } })` → Sequelize `include:`
 *     with nested `include:` and `as:` aliases.
 *   - Embedded sub-docs (`meeting{}`, `terms{}`, `contract{}`, `cancellation_request{}`,
 *     `withdrawal{}`, `promotion{}`) were lifted into 1:1 child tables; we
 *     eager-load them via `include:` and re-expose as plain objects on the
 *     parent row so existing call sites keep working unchanged.
 *   - Transactional flow: the legacy `session.withTransaction(...)` pattern is
 *     replaced by `sequelize.transaction()`. Per-query session options are
 *     dropped (Sequelize attaches the transaction at the unit-of-work boundary).
 *
 * Repository boundary:
 *   - The legacy `jockeyAssignmentRepository.js` (dual-mode) is no longer used
 *     here. All reads/writes against `jockey_assignments` and its child tables
 *     go through `loadSequelizeModels()` directly via the helpers below.
 *   - `profileRepository` and `raceRepository` resolve to the Sequelize
 *     implementations directly.
 */

const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const {
    ASSIGNMENT_STATUS,
    ASSIGNMENT_TYPE,
    ASSIGNMENT_CANCELLATION_STATUS,
    ASSIGNMENT_CANCELLATION_PARTY,
    REGISTRATION_STATUS
} = require('../constants/statuses');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const cloudinaryService = require('./cloudinaryService');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { toPlain, projectUpdate } = require('../repositories/sequelize/adapter');

const STARTED_OR_CLOSED_STATUSES = [
    'starting',
    'started',
    'running',
    'ongoing',
    'in_progress',
    'completed',
    'finished',
    'cancelled',
    'archived'
];
const ACTIVE_ASSIGNMENT_STATUSES = [
    'pending',
    ASSIGNMENT_STATUS.MEETING_INVITED,
    ASSIGNMENT_STATUS.MEETING_ACCEPTED,
    ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION,
    ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION,
    ASSIGNMENT_STATUS.STANDBY_CONFIRMED,
    ASSIGNMENT_STATUS.TERMS_AGREED,
    ASSIGNMENT_STATUS.TERMS_REJECTED,
    ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
    ASSIGNMENT_STATUS.ACCEPTED
];
const WITHDRAWABLE_ASSIGNMENT_STATUSES = [
    'pending',
    ASSIGNMENT_STATUS.MEETING_INVITED,
    ASSIGNMENT_STATUS.MEETING_ACCEPTED,
    ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION,
    ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION,
    ASSIGNMENT_STATUS.TERMS_AGREED,
    ASSIGNMENT_STATUS.TERMS_REJECTED,
    ASSIGNMENT_STATUS.CONTRACT_UPLOADED
];
const BINDING_ASSIGNMENT_STATUSES = [
    ASSIGNMENT_STATUS.ACCEPTED,
    ASSIGNMENT_STATUS.STANDBY_CONFIRMED
];

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

function hasStartedOrClosed(status) {
    return STARTED_OR_CLOSED_STATUSES.includes((status || '').toLowerCase());
}

function activeAssignmentFilter(extraFilter) {
    return Object.assign({
        status: { $in: ACTIVE_ASSIGNMENT_STATUSES }
    }, extraFilter || {});
}

function isBindingAssignment(assignment) {
    if (assignment.assignment_type === ASSIGNMENT_TYPE.BACKUP) {
        return [
            ASSIGNMENT_STATUS.STANDBY_CONFIRMED,
            ASSIGNMENT_STATUS.TERMS_AGREED,
            ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
            ASSIGNMENT_STATUS.ACCEPTED
        ].includes(assignment.status);
    }

    return assignment.status === ASSIGNMENT_STATUS.ACCEPTED;
}

/**
 * Clone a Sequelize-loaded sub-document (or plain object) into a fresh object
 * so callers can mutate it without mutating the cached row.
 */
function cloneSubdocument(value) {
    if (!value) {
        return undefined;
    }

    if (typeof value.toObject === 'function') {
        return value.toObject();
    }

    if (typeof value.toJSON === 'function') {
        return value.toJSON();
    }

    return Object.assign({}, value);
}

/**
 * Load a single JockeyAssignment row with all of its embedded sub-docs
 * (meeting, terms, contract, cancellation_request, withdrawal, promotion)
 * eager-loaded as plain objects, mirroring the legacy `.populate()` shape.
 */
async function findAssignmentById(id) {
    const { Op } = require('sequelize');
    const M = getModels();
    const { JockeyAssignment, JockeyAssignmentMeeting, JockeyAssignmentTerm, JockeyAssignmentContract, JockeyAssignmentCancellationRequest, JockeyAssignmentWithdrawal, JockeyAssignmentPromotion } = M;

    const row = await JockeyAssignment.findOne({
        where: { id },
        include: [
            { model: JockeyAssignmentMeeting, as: 'meeting', required: false },
            { model: JockeyAssignmentTerm, as: 'terms', required: false },
            { model: JockeyAssignmentContract, as: 'contract', required: false },
            { model: JockeyAssignmentCancellationRequest, as: 'cancellation_request', required: false },
            { model: JockeyAssignmentWithdrawal, as: 'withdrawal', required: false },
            { model: JockeyAssignmentPromotion, as: 'promotion', required: false }
        ]
    });

    if (!row) return null;
    return decorateAssignment(toPlain(row));
}

/**
 * Load a list of JockeyAssignment rows with the same eager-loaded sub-docs.
 */
async function findAssignments(filter) {
    const { Op } = require('sequelize');
    const M = getModels();
    const { JockeyAssignment, JockeyAssignmentMeeting, JockeyAssignmentTerm, JockeyAssignmentContract, JockeyAssignmentCancellationRequest, JockeyAssignmentWithdrawal, JockeyAssignmentPromotion, Race, Horse, HorseOwner, Jockey, Tournament, Round, RaceReferee, User } = M;

    const where = buildAssignmentWhere(filter || {});
    const rows = await JockeyAssignment.findAll({
        where,
        include: [
            { model: JockeyAssignmentMeeting, as: 'meeting', required: false },
            { model: JockeyAssignmentTerm, as: 'terms', required: false },
            { model: JockeyAssignmentContract, as: 'contract', required: false },
            { model: JockeyAssignmentCancellationRequest, as: 'cancellation_request', required: false },
            { model: JockeyAssignmentWithdrawal, as: 'withdrawal', required: false },
            { model: JockeyAssignmentPromotion, as: 'promotion', required: false },
            {
                model: Race,
                as: 'race',
                include: [
                    { model: Tournament, as: 'tournament' },
                    { model: Round, as: 'round' },
                    { model: RaceReferee, as: 'referee', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] }
                ]
            },
            { model: Horse, as: 'horse' },
            { model: HorseOwner, as: 'owner' },
            { model: Jockey, as: 'jockey', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] }
        ],
        order: [['invited_at', 'DESC']]
    });

    return rows.map((row) => decorateAssignment(toPlain(row)));
}

function buildAssignmentWhere(filter) {
    const { Op } = require('sequelize');
    const where = {};
    Object.keys(filter).forEach((key) => {
        const value = filter[key];
        const sequelizeKey = key === '_id' ? 'id' : key;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (value.$in !== undefined) {
                where[sequelizeKey] = { [Op.in]: value.$in };
                return;
            }
            if (value.$ne !== undefined) {
                where[sequelizeKey] = { [Op.ne]: value.$ne };
                return;
            }
        }

        where[sequelizeKey] = value;
    });
    return where;
}

/**
 * Decorate a JockeyAssignment row so existing legacy-shaped accessors
 * keep working: child rows that were lifted to 1:1 tables are exposed as
 * plain objects via the original sub-doc names (`meeting`, `terms`,
 * `contract`, `cancellation_request`, `withdrawal`, `promotion`).
 *
 * Sequelize's `as:` aliases already deliver each child row as `row.meeting`
 * etc., so this helper just flattens one level and aliases the `_id`.
 */
function decorateAssignment(row) {
    if (!row) return row;
    ['meeting', 'terms', 'contract', 'cancellation_request', 'withdrawal', 'promotion'].forEach((key) => {
        if (row[key]) {
            const child = typeof row[key].toJSON === 'function' ? row[key].toJSON() : row[key];
            if (child && child._id === undefined && child.id !== undefined) {
                child._id = child.id;
            }
            row[key] = child;
        }
    });
    return row;
}

function isJockeySuspended(jockey) {
    return Boolean(jockey && jockey.suspended_until && new Date(jockey.suspended_until).getTime() > Date.now());
}

async function ensureJockeyNotSuspended(jockey) {
    if (isJockeySuspended(jockey)) {
        throw new ApiError(400, 'Suspended jockeys cannot accept or receive new race assignments');
    }

    if (jockey && jockey.disciplinary_status === 'suspended') {
        const { Jockey } = getModels();
        await Jockey.update({ disciplinary_status: 'clear' }, { where: { id: jockey._id || jockey.id } });
    }
}

async function resolveOwner(req, payload) {
    if (hasRole(req, ROLE_NAMES.ADMIN)) {
        if (!payload.owner_id) {
            throw new ApiError(400, 'owner_id is required for admin assignment create');
        }

        return payload.owner_id;
    }

    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (!owner) {
        throw new ApiError(404, 'Horse owner profile not found');
    }

    return owner._id;
}

/**
 * Find a Race with optimistic locking semantics (status + assignment_revision).
 * Returns the updated race row (with bumped revision) on success, or null if
 * the precondition did not hold. Mirrors the legacy
 * `Race.findOneAndUpdate({ _id, status: { $nin: ... } }, { $inc: { ... } })`
 * pattern.
 */
async function findRaceAndIncrementAssignmentRevision(raceId) {
    const { Op } = require('sequelize');
    const { Race } = getModels();

    const [[updated]] = await getSequelize().query(
        `UPDATE races
            SET assignment_revision = COALESCE(assignment_revision, 0) + 1,
                updated_at = NOW()
          WHERE id = ? AND LOWER(COALESCE(status, '')) NOT IN (${STARTED_OR_CLOSED_STATUSES.map(() => '?').join(', ')})
          RETURNING *`,
        { replacements: [raceId, ...STARTED_OR_CLOSED_STATUSES] }
    );

    return updated || null;
}

/**
 * Conditionally update a JockeyAssignment row by id, only if its current
 * status (and any additional filters) match. Returns the reloaded row
 * (with eager-loaded sub-docs) on success, or null if the precondition
 * did not hold. Mirrors `findOneAndUpdate(filter, update, { returnDocument: 'after' })`.
 */
async function findAssignmentAndUpdate(filter, update) {
    const { Op } = require('sequelize');
    const { JockeyAssignment } = getModels();

    const where = { id: filter._id };
    if (filter.status !== undefined) {
        where.status = filter.status;
    }
    if (filter.assignment_type !== undefined) {
        where.assignment_type = filter.assignment_type;
    }
    if (filter['cancellation_request.status'] !== undefined) {
        const cancelVal = filter['cancellation_request.status'];
        // "$ne" filter: cancellation_request.status != X
        const { JockeyAssignmentCancellationRequest } = getModels();
        if (cancelVal && typeof cancelVal === 'object' && cancelVal.$ne !== undefined) {
            where.id = {
                [Op.notIn]: getSequelize().literal(
                    `(SELECT assignment_id FROM jockey_assignment_cancellation_requests WHERE status = '${cancelVal.$ne}')`
                )
            };
            delete where.status;
        }
    }

    const fields = projectUpdate(update);
    const [affected] = await JockeyAssignment.update(fields, { where });
    if (affected === 0) return null;
    return findAssignmentById(where.id);
}

async function createAssignment(req, payload) {
    const { Op } = require('sequelize');
    const M = getModels();
    const { Horse, Jockey, Race, Registration } = M;

    const [race, horse, jockey] = await Promise.all([
        raceRepository.findById(payload.race_id),
        Horse.findByPk(payload.horse_id).then((row) => toPlain(row)),
        Jockey.findByPk(payload.jockey_id).then((row) => toPlain(row))
    ]);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    if (!horse) {
        throw new ApiError(404, 'Horse not found');
    }

    if (!jockey) {
        throw new ApiError(404, 'Jockey not found');
    }

    if (hasStartedOrClosed(race.status)) {
        throw new ApiError(400, 'Jockey cannot be invited after the race has started or finished');
    }

    if (horse.status !== 'active') {
        throw new ApiError(400, 'Only active horses can invite jockeys');
    }

    if (jockey.status !== 'active') {
        throw new ApiError(400, 'Only active jockeys can be invited');
    }

    await ensureJockeyNotSuspended(jockey);

    const ownerId = await resolveOwner(req, payload);

    if (!sameId(horse.owner_id, ownerId)) {
        throw new ApiError(403, 'Horse does not belong to this owner');
    }

    const eligibleRegistration = await Registration.findOne({
        where: {
            race_id: payload.race_id,
            horse_id: payload.horse_id,
            owner_id: ownerId,
            status: REGISTRATION_STATUS.APPROVED,
            payment_status: { [Op.in]: ['paid', 'not_required'] }
        },
        raw: true
    });

    if (!eligibleRegistration) {
        throw new ApiError(
            409,
            'A confirmed and fully paid race entry is required before inviting a jockey'
        );
    }

    const meetingTime = new Date(payload.meeting.meeting_time);

    if (race.race_date && meetingTime.getTime() >= new Date(race.race_date).getTime()) {
        throw new ApiError(400, 'The appointment must take place before the race starts');
    }

    const assignmentType = payload.assignment_type || ASSIGNMENT_TYPE.PRIMARY;
    const backupPriority = assignmentType === ASSIGNMENT_TYPE.BACKUP ? 1 : undefined;
    const sequelize = getSequelize();
    let assignment;

    try {
        await sequelize.transaction(async () => {
            const openRace = await findRaceAndIncrementAssignmentRevision(payload.race_id);

            if (!openRace) {
                throw new ApiError(409, 'Jockey cannot be invited after the race has started or finished');
            }

            const existingPrimary = await findAssignments(activeAssignmentFilter({
                race_id: payload.race_id,
                horse_id: payload.horse_id,
                assignment_type: ASSIGNMENT_TYPE.PRIMARY
            })).then((rows) => rows[0] || null);

            if (assignmentType === ASSIGNMENT_TYPE.PRIMARY && existingPrimary) {
                throw new ApiError(409, 'This horse already has an active primary jockey assignment for the selected race', {
                    assignment_id: existingPrimary._id,
                    status: existingPrimary.status
                });
            }

            if (
                assignmentType === ASSIGNMENT_TYPE.BACKUP
                && (
                    !existingPrimary
                    || existingPrimary.status !== ASSIGNMENT_STATUS.ACCEPTED
                    || existingPrimary.cancellation_request?.status === ASSIGNMENT_CANCELLATION_STATUS.PENDING
                )
            ) {
                throw new ApiError(
                    409,
                    'An accepted primary jockey without a pending cancellation is required before inviting a backup jockey'
                );
            }

            if (assignmentType === ASSIGNMENT_TYPE.BACKUP) {
                const existingBackup = await findAssignments(activeAssignmentFilter({
                    race_id: payload.race_id,
                    horse_id: payload.horse_id,
                    assignment_type: ASSIGNMENT_TYPE.BACKUP
                })).then((rows) => rows[0] || null);

                if (existingBackup) {
                    throw new ApiError(409, 'This horse already has an active backup jockey assignment for the selected race', {
                        assignment_id: existingBackup._id,
                        status: existingBackup.status
                    });
                }
            }

            const existingSameJockey = await findAssignments(activeAssignmentFilter({
                race_id: payload.race_id,
                horse_id: payload.horse_id,
                jockey_id: payload.jockey_id
            })).then((rows) => rows[0] || null);

            if (existingSameJockey) {
                throw new ApiError(409, 'This jockey already has an active assignment for the selected horse and race', {
                    assignment_id: existingSameJockey._id,
                    assignment_type: existingSameJockey.assignment_type,
                    status: existingSameJockey.status
                });
            }

            const { JockeyAssignment, JockeyAssignmentMeeting } = M;

            const created = await JockeyAssignment.create({
                race_id: payload.race_id,
                horse_id: payload.horse_id,
                owner_id: ownerId,
                jockey_id: payload.jockey_id,
                assignment_type: assignmentType,
                backup_priority: assignmentType === ASSIGNMENT_TYPE.BACKUP ? backupPriority : undefined,
                backup_for_assignment_id: assignmentType === ASSIGNMENT_TYPE.BACKUP ? existingPrimary._id : undefined,
                invitation_message: payload.invitation_message,
                status: ASSIGNMENT_STATUS.MEETING_INVITED,
                invited_at: new Date()
            });

            // Persist the embedded `meeting{}` sub-doc into the child table.
            if (payload.meeting) {
                await JockeyAssignmentMeeting.create({
                    assignment_id: created.id,
                    ...payload.meeting
                });
            }

            assignment = await findAssignmentById(created.id);
        });
    } catch (error) {
        if (error?.code === '23505' || error?.original?.code === '23505') {
            throw new ApiError(409, assignmentType === ASSIGNMENT_TYPE.BACKUP
                ? 'This horse already has an active backup jockey assignment for the selected race'
                : 'This horse already has an active primary jockey assignment for the selected race');
        }
        throw error;
    }

    return {
        assignment: assignment
    };
}

async function listAssignments(req, query) {
    const filter = {};

    ['race_id', 'horse_id', 'owner_id', 'jockey_id', 'status', 'assignment_type'].forEach(function(field) {
        if (query[field]) {
            filter[field] = query[field];
        }
    });

    if (hasRole(req, ROLE_NAMES.HORSE_OWNER) && !hasRole(req, ROLE_NAMES.ADMIN)) {
        const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

        if (!owner) {
            throw new ApiError(404, 'Horse owner profile not found');
        }

        filter.owner_id = owner._id;
    }

    if (hasRole(req, ROLE_NAMES.JOCKEY) && !hasRole(req, ROLE_NAMES.ADMIN) && !hasRole(req, ROLE_NAMES.HORSE_OWNER)) {
        const jockey = await profileRepository.findJockeyByUserId(req.user._id);

        if (!jockey) {
            throw new ApiError(404, 'Jockey profile not found');
        }

        filter.jockey_id = jockey._id;
    }

    return {
        assignments: await findAssignments(filter)
    };
}

async function ensureCanViewAssignment(req, assignment) {
    if (hasRole(req, ROLE_NAMES.ADMIN)) {
        return;
    }

    if (hasRole(req, ROLE_NAMES.HORSE_OWNER)) {
        const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

        if (owner && sameId(assignment.owner_id, owner._id)) {
            return;
        }
    }

    if (hasRole(req, ROLE_NAMES.JOCKEY)) {
        const jockey = await profileRepository.findJockeyByUserId(req.user._id);

        if (jockey && sameId(assignment.jockey_id, jockey._id)) {
            return;
        }
    }

    throw new ApiError(403, 'You do not have permission to view this assignment');
}

async function getAssignment(req, id) {
    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    await ensureCanViewAssignment(req, assignment);

    return {
        assignment: assignment
    };
}

async function cancelAssignment(req, id) {
    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    if (!hasRole(req, ROLE_NAMES.ADMIN)) {
        const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

        if (!owner || !sameId(assignment.owner_id, owner._id)) {
            throw new ApiError(403, 'You do not have permission to cancel this assignment');
        }
    }

    if (!['pending', ASSIGNMENT_STATUS.MEETING_INVITED].includes(assignment.status)) {
        throw new ApiError(409, 'Only pending jockey invitations can be cancelled');
    }

    const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
        _id: id,
        status: assignment.status
    }, {
        $set: {
            status: ASSIGNMENT_STATUS.CANCELLED,
            responded_at: new Date()
        }
    }, 'The invitation changed before it could be cancelled');

    return {
        assignment: updatedAssignment
    };
}

async function ensureJockeyHasNoRaceBinding(assignment, jockeyId) {
    const { Op } = require('sequelize');
    const raceId = assignment.race_id;
    const conflict = (await findAssignments({
        _id: { $ne: assignment._id },
        race_id: raceId,
        jockey_id: jockeyId,
        status: { $in: BINDING_ASSIGNMENT_STATUSES }
    }))[0] || null;

    if (conflict) {
        throw new ApiError(409, 'This jockey is already confirmed for another horse in the selected race', {
            assignment_id: conflict._id,
            horse_id: conflict.horse_id,
            assignment_type: conflict.assignment_type
        });
    }
}

async function resolveCancellationActor(req, assignment) {
    if (hasRole(req, ROLE_NAMES.HORSE_OWNER)) {
        const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

        if (owner && sameId(assignment.owner_id, owner._id)) {
            return {
                party: ASSIGNMENT_CANCELLATION_PARTY.HORSE_OWNER,
                profile: owner
            };
        }
    }

    if (hasRole(req, ROLE_NAMES.JOCKEY)) {
        const jockey = await profileRepository.findJockeyByUserId(req.user._id);

        if (jockey && sameId(assignment.jockey_id, jockey._id)) {
            return {
                party: ASSIGNMENT_CANCELLATION_PARTY.JOCKEY,
                profile: jockey
            };
        }
    }

    throw new ApiError(403, 'You are not a party to this jockey assignment');
}

async function withdrawAssignment(req, id, payload) {
    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    const actor = await resolveCancellationActor(req, assignment);

    if (isBindingAssignment(assignment)) {
        throw new ApiError(
            409,
            'This assignment is already binding; both parties must use mutual cancellation'
        );
    }

    if (!WITHDRAWABLE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
        throw new ApiError(
            409,
            'This assignment cannot be withdrawn at its current stage; use mutual cancellation after it becomes active'
        );
    }

    const withdrawnAt = new Date();
    const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
        _id: id,
        status: assignment.status
    }, {
        $set: {
            status: ASSIGNMENT_STATUS.CANCELLED,
            withdrawal: {
                initiated_by_party: actor.party,
                initiated_by: req.user._id,
                reason: payload.reason,
                withdrawn_at: withdrawnAt
            },
            responded_at: withdrawnAt
        }
    }, 'The assignment changed before it could be withdrawn');

    return {
        assignment: updatedAssignment
    };
}

async function mutateAssignmentWhileRaceOpen(assignment, filter, update, conflictMessage) {
    const raceId = assignment.race_id;
    const sequelize = getSequelize();
    let updatedAssignment;

    try {
        await sequelize.transaction(async () => {
            const openRace = await findRaceAndIncrementAssignmentRevision(raceId);

            if (!openRace) {
                throw new ApiError(409, 'A jockey assignment cannot be changed after the race has started');
            }

            // Conditional update with eager-loaded retry so we can return the
            // fully-populated row (matches `returnDocument: 'after'`).
            updatedAssignment = await findAssignmentAndUpdate(filter, update);

            if (!updatedAssignment) {
                throw new ApiError(409, conflictMessage);
            }
        });
    } catch (error) {
        if (error && (error.code === '23505' || error.original?.code === '23505') && error.keyPattern && error.keyPattern.jockey_id) {
            throw new ApiError(409, 'This jockey is already confirmed for another horse in the selected race');
        }
        throw error;
    }

    return updatedAssignment;
}

async function requestCancellation(req, id, payload) {
    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    const actor = await resolveCancellationActor(req, assignment);

    if (!isBindingAssignment(assignment)) {
        throw new ApiError(
            409,
            'Mutual cancellation is only available for an accepted primary contract or confirmed standby agreement'
        );
    }

    if (assignment.cancellation_request?.status === ASSIGNMENT_CANCELLATION_STATUS.PENDING) {
        throw new ApiError(409, 'This assignment already has a pending cancellation request');
    }

    const requestedAt = new Date();
    const sequelize = getSequelize();

    let updatedAssignment;
    await sequelize.transaction(async () => {
        const openRace = await findRaceAndIncrementAssignmentRevision(assignment.race_id);

        if (!openRace) {
            throw new ApiError(409, 'A jockey assignment cannot be changed after the race has started');
        }

        const { JockeyAssignmentCancellationRequest } = getModels();
        await JockeyAssignmentCancellationRequest.upsert({
            assignment_id: id,
            status: ASSIGNMENT_CANCELLATION_STATUS.PENDING,
            initiated_by_party: actor.party,
            initiated_by: req.user._id,
            reason: payload.reason,
            requested_at: requestedAt,
            responded_by_party: null,
            responded_by: null,
            response_message: null,
            responded_at: null
        });

        updatedAssignment = await findAssignmentById(id);
    });

    return {
        assignment: updatedAssignment
    };
}

async function respondToCancellation(req, id, payload) {
    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    const actor = await resolveCancellationActor(req, assignment);
    const cancellationRequest = assignment.cancellation_request;

    if (
        !isBindingAssignment(assignment) ||
        !cancellationRequest ||
        cancellationRequest.status !== ASSIGNMENT_CANCELLATION_STATUS.PENDING
    ) {
        throw new ApiError(409, 'This assignment has no pending cancellation request');
    }

    if (cancellationRequest.initiated_by_party === actor.party) {
        throw new ApiError(403, 'The party that requested cancellation cannot approve or reject its own request');
    }

    const approved = payload.decision === 'approve';
    const responseStatus = approved
        ? ASSIGNMENT_CANCELLATION_STATUS.APPROVED
        : ASSIGNMENT_CANCELLATION_STATUS.REJECTED;
    const respondedAt = new Date();

    const sequelize = getSequelize();
    let updatedAssignment;

    await sequelize.transaction(async () => {
        const openRace = await findRaceAndIncrementAssignmentRevision(assignment.race_id);

        if (!openRace) {
            throw new ApiError(409, 'A jockey assignment cannot be changed after the race has started');
        }

        const { JockeyAssignment, JockeyAssignmentCancellationRequest } = getModels();
        await JockeyAssignmentCancellationRequest.update({
            status: responseStatus,
            responded_by_party: actor.party,
            responded_by: req.user._id,
            response_message: payload.response_message,
            responded_at: respondedAt
        }, { where: { assignment_id: id } });

        if (approved) {
            await JockeyAssignment.update({
                status: ASSIGNMENT_STATUS.CANCELLED,
                responded_at: respondedAt
            }, { where: { id } });
        }

        updatedAssignment = await findAssignmentById(id);
    });

    return {
        assignment: updatedAssignment
    };
}

async function respondToMeeting(userId, id, status, responseMessage) {
    const jockey = await profileRepository.findJockeyByUserId(userId);

    if (!jockey) {
        throw new ApiError(404, 'Jockey profile not found');
    }

    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    if (!sameId(assignment.jockey_id, jockey._id)) {
        throw new ApiError(403, 'You do not have permission to respond to this assignment');
    }

    if (!['pending', ASSIGNMENT_STATUS.MEETING_INVITED].includes(assignment.status)) {
        throw new ApiError(400, 'Only appointment invitations can be accepted or rejected');
    }

    if (status === ASSIGNMENT_STATUS.MEETING_ACCEPTED) {
        await ensureJockeyNotSuspended(jockey);
    }

    const meeting = Object.assign({}, assignment.meeting ? (typeof assignment.meeting.toObject === 'function' ? assignment.meeting.toObject() : assignment.meeting) : {});

    meeting.response_message = responseMessage;

    if (status === ASSIGNMENT_STATUS.MEETING_ACCEPTED) {
        meeting.accepted_at = new Date();
    }

    if (status === ASSIGNMENT_STATUS.MEETING_REJECTED) {
        meeting.rejected_at = new Date();
    }

    const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
        _id: id,
        status: assignment.status
    }, {
        $set: {
            status: status,
            response_message: responseMessage,
            meeting: meeting,
            responded_at: new Date()
        }
    }, 'The appointment invitation changed before your response was saved');

    return {
        assignment: updatedAssignment
    };
}

async function acceptMeeting(userId, id, responseMessage) {
    return respondToMeeting(userId, id, ASSIGNMENT_STATUS.MEETING_ACCEPTED, responseMessage);
}

async function rejectMeeting(userId, id, responseMessage) {
    return respondToMeeting(userId, id, ASSIGNMENT_STATUS.MEETING_REJECTED, responseMessage);
}

async function ensureOwnerCanMutate(req, assignment, action) {
    if (hasRole(req, ROLE_NAMES.ADMIN)) {
        return;
    }

    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (!owner || !sameId(assignment.owner_id, owner._id)) {
        throw new ApiError(403, 'You do not have permission to ' + action + ' this assignment');
    }
}

async function updateTerms(req, id, payload) {
    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    await ensureOwnerCanMutate(req, assignment, 'update terms for');

    if (![ASSIGNMENT_STATUS.MEETING_ACCEPTED, ASSIGNMENT_STATUS.TERMS_REJECTED].includes(assignment.status)) {
        throw new ApiError(400, 'Terms can only be sent after the jockey accepts the appointment invitation');
    }

    const pendingStatus = assignment.assignment_type === ASSIGNMENT_TYPE.BACKUP
        ? ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION
        : ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION;
    const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
        _id: id,
        status: assignment.status
    }, {
        $set: {
            status: pendingStatus,
            terms: {
                agreed_terms: payload.agreed_terms,
                meeting_note: payload.meeting_note,
                agreed_at: payload.agreed_at || new Date(),
                sent_at: new Date(),
                updated_by: req.user._id
            }
        }
    }, 'The assignment changed before the terms were saved');

    return {
        assignment: updatedAssignment
    };
}

async function respondToTerms(userId, id, status, responseMessage) {
    const jockey = await profileRepository.findJockeyByUserId(userId);

    if (!jockey) {
        throw new ApiError(404, 'Jockey profile not found');
    }

    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    if (!sameId(assignment.jockey_id, jockey._id)) {
        throw new ApiError(403, 'You do not have permission to respond to these terms');
    }

    const expectedPendingStatus = assignment.assignment_type === ASSIGNMENT_TYPE.BACKUP
        ? [
            ASSIGNMENT_STATUS.STANDBY_TERMS_PENDING_CONFIRMATION,
            ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION
        ]
        : ASSIGNMENT_STATUS.TERMS_PENDING_CONFIRMATION;

    if (
        Array.isArray(expectedPendingStatus)
            ? !expectedPendingStatus.includes(assignment.status)
            : assignment.status !== expectedPendingStatus
    ) {
        throw new ApiError(400, 'Only terms awaiting confirmation can be accepted or rejected');
    }

    const confirmedStatus = assignment.assignment_type === ASSIGNMENT_TYPE.BACKUP
        ? ASSIGNMENT_STATUS.STANDBY_CONFIRMED
        : ASSIGNMENT_STATUS.TERMS_AGREED;
    const nextStatus = status === ASSIGNMENT_STATUS.TERMS_AGREED
        ? confirmedStatus
        : ASSIGNMENT_STATUS.TERMS_REJECTED;

    if (nextStatus === confirmedStatus) {
        await ensureJockeyNotSuspended(jockey);
        await ensureJockeyHasNoRaceBinding(assignment, jockey._id);
    }

    const terms = Object.assign({}, assignment.terms ? (typeof assignment.terms.toObject === 'function' ? assignment.terms.toObject() : assignment.terms) : {});
    terms.response_message = responseMessage;

    if (nextStatus === confirmedStatus) {
        terms.confirmed_at = new Date();
    }

    if (nextStatus === ASSIGNMENT_STATUS.TERMS_REJECTED) {
        terms.rejected_at = new Date();
    }

    const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
        _id: id,
        status: assignment.status
    }, {
        $set: {
            status: nextStatus,
            response_message: responseMessage,
            terms: terms,
            responded_at: new Date()
        }
    }, 'The assignment changed before your terms response was saved');

    return {
        assignment: updatedAssignment
    };
}

async function confirmTerms(userId, id, responseMessage) {
    return respondToTerms(userId, id, ASSIGNMENT_STATUS.TERMS_AGREED, responseMessage);
}

async function rejectTerms(userId, id, responseMessage) {
    return respondToTerms(userId, id, ASSIGNMENT_STATUS.TERMS_REJECTED, responseMessage);
}

async function uploadContract(req, id, payload) {
    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    await ensureOwnerCanMutate(req, assignment, 'upload contract for');

    if (assignment.assignment_type !== ASSIGNMENT_TYPE.PRIMARY) {
        throw new ApiError(400, 'Backup jockeys confirm standby terms and do not upload a riding contract');
    }

    if (assignment.status !== ASSIGNMENT_STATUS.TERMS_AGREED) {
        throw new ApiError(400, 'Contract can only be sent after the jockey confirms the terms');
    }

    const contractPayload = Object.assign({}, payload.contract);
    const contractUpload = await cloudinaryService.uploadOptionalSource(
        contractPayload.file_data,
        contractPayload.file_url,
        { folder: 'horse-racing/contracts', resource_type: 'auto' }
    );

    delete contractPayload.file_data;

    if (contractUpload) {
        contractPayload.file_url = contractUpload.secure_url;
        contractPayload.file_public_id = contractUpload.public_id;
    }

    contractPayload.uploaded_at = new Date();

    const sequelize = getSequelize();
    let updatedAssignment;

    await sequelize.transaction(async () => {
        const openRace = await findRaceAndIncrementAssignmentRevision(assignment.race_id);

        if (!openRace) {
            throw new ApiError(409, 'A jockey assignment cannot be changed after the race has started');
        }

        const { JockeyAssignment, JockeyAssignmentContract } = getModels();
        const affected = await JockeyAssignment.update({
            status: ASSIGNMENT_STATUS.CONTRACT_UPLOADED
        }, {
            where: {
                id,
                status: ASSIGNMENT_STATUS.TERMS_AGREED,
                assignment_type: ASSIGNMENT_TYPE.PRIMARY
            }
        });

        if (affected[0] === 0) {
            throw new ApiError(409, 'The assignment changed before the contract was saved');
        }

        await JockeyAssignmentContract.upsert({
            assignment_id: id,
            ...contractPayload
        });

        updatedAssignment = await findAssignmentById(id);
    });

    return {
        assignment: updatedAssignment
    };
}

async function promoteBackup(req, id, payload) {
    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    await ensureOwnerCanMutate(req, assignment, 'promote');

    if (assignment.assignment_type !== ASSIGNMENT_TYPE.BACKUP) {
        throw new ApiError(400, 'Only backup jockey assignments can be promoted');
    }

    if (![
        ASSIGNMENT_STATUS.STANDBY_CONFIRMED,
        ASSIGNMENT_STATUS.TERMS_AGREED,
        ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
        ASSIGNMENT_STATUS.ACCEPTED
    ].includes(assignment.status)) {
        throw new ApiError(400, 'Only confirmed standby assignments can be promoted');
    }

    const raceId = assignment.race_id;
    const horseId = assignment.horse_id;
    const race = await raceRepository.findById(raceId);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    if (hasStartedOrClosed(race.status)) {
        throw new ApiError(400, 'Backup jockey cannot be promoted after the race has started or finished');
    }

    const sequelize = getSequelize();
    let previousPrimaryAssignmentId = null;

    await sequelize.transaction(async () => {
        const transactionalRace = await findRaceAndIncrementAssignmentRevision(raceId);

        if (!transactionalRace) {
            throw new ApiError(409, 'Backup jockey cannot be promoted after the race has started or finished');
        }

        const transactionalBackup = await findAssignmentById(id);

        if (!transactionalBackup || transactionalBackup.assignment_type !== ASSIGNMENT_TYPE.BACKUP) {
            throw new ApiError(409, 'The backup assignment changed before it could be promoted');
        }

        if (![
            ASSIGNMENT_STATUS.STANDBY_CONFIRMED,
            ASSIGNMENT_STATUS.TERMS_AGREED,
            ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
            ASSIGNMENT_STATUS.ACCEPTED
        ].includes(transactionalBackup.status)) {
            throw new ApiError(409, 'The backup assignment changed before it could be promoted');
        }

        if (transactionalBackup.cancellation_request?.status === ASSIGNMENT_CANCELLATION_STATUS.PENDING) {
            throw new ApiError(409, 'Resolve the backup cancellation request before promotion');
        }

        const currentPrimary = (await findAssignments(activeAssignmentFilter({
            race_id: raceId,
            horse_id: horseId,
            assignment_type: ASSIGNMENT_TYPE.PRIMARY
        })))[0] || null;

        if (currentPrimary) {
            throw new ApiError(
                409,
                'The active primary assignment must end before promoting a backup jockey'
            );
        }

        const standbyTerms = cloneSubdocument(transactionalBackup.terms);
        const standbyContract = cloneSubdocument(transactionalBackup.contract);
        previousPrimaryAssignmentId = transactionalBackup.backup_for_assignment_id || null;
        const promotedAt = new Date();

        const { JockeyAssignment, JockeyAssignmentStandbyTerm, JockeyAssignmentStandbyContract, JockeyAssignmentPromotion } = getModels();

        await JockeyAssignment.update({
            assignment_type: ASSIGNMENT_TYPE.PRIMARY,
            backup_for_assignment_id: previousPrimaryAssignmentId,
            status: ASSIGNMENT_STATUS.MEETING_ACCEPTED,
            backup_priority: null
        }, { where: { id } });

        // Lift embedded sub-docs into child tables.
        await JockeyAssignment.update({ terms: null, contract: null }, { where: { id } }).catch(() => {});
        // The terms/contract columns are not on the JockeyAssignment table, so
        // we instead persist them to standby_terms / standby_contract tables.
        if (standbyTerms) {
            await JockeyAssignmentStandbyTerm.upsert({
                assignment_id: id,
                ...standbyTerms
            });
        }
        if (standbyContract) {
            await JockeyAssignmentStandbyContract.upsert({
                assignment_id: id,
                ...standbyContract
            });
        }
        await JockeyAssignmentPromotion.upsert({
            assignment_id: id,
            promoted_at: promotedAt,
            promoted_by: req.user._id,
            reason: payload.reason,
            previous_primary_assignment_id: previousPrimaryAssignmentId
        });
    });

    const updatedAssignment = await findAssignmentById(id);

    return {
        assignment: updatedAssignment,
        previous_primary_assignment_id: previousPrimaryAssignmentId
    };
}

async function respondToContract(userId, id, status, responseMessage) {
    const jockey = await profileRepository.findJockeyByUserId(userId);

    if (!jockey) {
        throw new ApiError(404, 'Jockey profile not found');
    }

    const assignment = await findAssignmentById(id);

    if (!assignment) {
        throw new ApiError(404, 'Jockey assignment not found');
    }

    if (!sameId(assignment.jockey_id, jockey._id)) {
        throw new ApiError(403, 'You do not have permission to respond to this assignment contract');
    }

    if (assignment.assignment_type !== ASSIGNMENT_TYPE.PRIMARY) {
        throw new ApiError(400, 'Backup jockeys confirm standby terms and do not confirm a riding contract');
    }

    if (assignment.status !== ASSIGNMENT_STATUS.CONTRACT_UPLOADED) {
        throw new ApiError(400, 'Only uploaded contracts can be confirmed or rejected');
    }

    if (status === ASSIGNMENT_STATUS.ACCEPTED) {
        await ensureJockeyNotSuspended(jockey);
        await ensureJockeyHasNoRaceBinding(assignment, jockey._id);
    }

    const contract = Object.assign({}, assignment.contract ? (typeof assignment.contract.toObject === 'function' ? assignment.contract.toObject() : assignment.contract) : {});

    contract.response_message = responseMessage;

    if (status === ASSIGNMENT_STATUS.ACCEPTED) {
        contract.confirmed_at = new Date();
    }

    if (status === ASSIGNMENT_STATUS.CONTRACT_REJECTED) {
        contract.rejected_at = new Date();
    }

    const updatedAssignment = await mutateAssignmentWhileRaceOpen(assignment, {
        _id: id,
        status: ASSIGNMENT_STATUS.CONTRACT_UPLOADED,
        assignment_type: ASSIGNMENT_TYPE.PRIMARY
    }, {
        $set: {
            status: status,
            response_message: responseMessage,
            contract: contract,
            responded_at: new Date()
        }
    }, 'The assignment changed before your contract response was saved');

    return {
        assignment: updatedAssignment
    };
}

async function confirmContract(userId, id, responseMessage) {
    return respondToContract(userId, id, ASSIGNMENT_STATUS.ACCEPTED, responseMessage);
}

async function rejectContract(userId, id, responseMessage) {
    return respondToContract(userId, id, ASSIGNMENT_STATUS.CONTRACT_REJECTED, responseMessage);
}

module.exports = {
    createAssignment,
    listAssignments,
    getAssignment,
    cancelAssignment,
    withdrawAssignment,
    requestCancellation,
    respondToCancellation,
    respondToMeeting,
    acceptMeeting,
    rejectMeeting,
    updateTerms,
    respondToTerms,
    confirmTerms,
    rejectTerms,
    uploadContract,
    promoteBackup,
    respondToContract,
    confirmContract,
    rejectContract
};
