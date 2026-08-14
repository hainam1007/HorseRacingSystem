'use strict';

/**
 * raceResultService — Sequelize/PostgreSQL implementation.
 *
 * Business logic and API response shape preserved from the legacy
 * service.
 *
 * Legacy-ORM concepts translated to Sequelize:
 *   - `Model.find({...})`  → `Model.findAll({ where: {...} })`.
 *   - `Model.findById(id)`  → `Model.findByPk(id)`.
 *   - `Model.countDocuments({...})` → `Model.count({ where: {...} })`.
 *   - `Model.findByIdAndUpdate(id, ...)` → `Model.update(fields, { where: { id }, returning: true })`.
 *   - `Model.updateMany(filter, $set: ...)` → `Model.update(setFields, { where })`.
 *   - `Model.findOneAndUpdate(filter, $set: ..., { returnDocument: 'after' })` → `Model.update + reload`.
 *   - `.populate({...})` → Sequelize `include:` with `as:` aliases.
 *   - Transactional flow: the legacy `session.withTransaction(...)` pattern is
 *     replaced by `sequelize.transaction()`; per-query session options are
 *     dropped (Sequelize attaches the transaction at the unit-of-work boundary).
 *   - `violation.penalty.score_deduction` → `violation.penalty.score_deduction`
 *     (the embedded penalty sub-doc was lifted into a child row
 *     `violation_penalties(kind='penalty')`; we eager-load it via `include:`
 *     and re-expose it on the parent row).
 *   - `result.applied_violation_ids[]` and `result.penalty_snapshot_violation_ids[]`
 *     were arrays of object references in the legacy schema; they are now child
 *     rows in `race_result_applied_violations` and
 *     `race_result_penalty_snapshot_violations`. We eager-load them via
 *     `include:` and re-expose as plain ID arrays on the parent row.
 *
 * Repositories used (`raceResultRepository`, `raceRepository`, `horseCheckRepository`,
 * `refereeReportRepository`, `violationRepository`, `profileRepository`)
 * resolve to the Sequelize implementations directly.
 */

const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const { HORSE_CHECK_PHASE, HORSE_CHECK_STATUS, RACE_RESULT_STATUS } = require('../constants/statuses');
const horseCheckRepository = require('../repositories/horseCheckRepository');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');
const raceResultRepository = require('../repositories/raceResultRepository');
const refereeReportRepository = require('../repositories/refereeReportRepository');
const violationRepository = require('../repositories/violationRepository');
const raceEngineService = require('./raceEngineService');
const betService = require('./betService');
const prizeService = require('./prizeService');
const horseRatingService = require('./horseRatingService');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { projectUpdate, toPlain } = require('../repositories/sequelize/adapter');
const DEMO_BYPASS_TIME_VALIDATIONS = String(process.env.DEMO_BYPASS_TIME_VALIDATIONS || '').toLowerCase() === 'true';

function getModels() {
    return loadSequelizeModels().models;
}

function getSequelize() {
    return loadSequelizeModels().sequelize;
}

/**
 * Wrap a Sequelize Violation row with legacy-shaped helpers so the rest
 * of the service can continue to read `violation.penalty.score_deduction`,
 * `violation._id`, etc.
 *
 * The embedded `penalty{}` sub-doc was lifted into a `violation_penalties`
 * child row (kind='penalty'). Eager-load it and expose as `violation.penalty`.
 *
 * Returns a plain object (toPlain) with `._id` alias set.
 */
async function loadViolationsWithPenalty(filter) {
    const { Op } = require('sequelize');
    const { Violation, ViolationPenalty } = getModels();

    const rows = await Violation.findAll({
        where: filter || {},
        include: [
            { model: ViolationPenalty, as: 'penalties', required: false }
        ]
    });

    return rows.map((row) => {
        const plain = toPlain(row);
        const penaltyRow = (plain.penalties || []).find((p) => p.kind === 'penalty') || null;
        plain.penalty = penaltyRow
            ? {
                score_deduction: Number(penaltyRow.score_deduction || 0),
                position_delta: Number(penaltyRow.position_delta || 0),
                time_penalty_seconds: Number(penaltyRow.time_penalty_seconds || 0),
                suspension_days: Number(penaltyRow.suspension_days || 0),
                fine_amount: Number(penaltyRow.fine_amount || 0),
                disqualified: penaltyRow.disqualified === true
            }
            : {};
        return plain;
    });
}

async function loadViolationByIdWithPenalty(id) {
    const { Op } = require('sequelize');
    const { Violation, ViolationPenalty } = getModels();

    const row = await Violation.findOne({
        where: { id },
        include: [
            { model: ViolationPenalty, as: 'penalties', required: false }
        ]
    });

    if (!row) return null;
    const plain = toPlain(row);
    const penaltyRow = (plain.penalties || []).find((p) => p.kind === 'penalty') || null;
    plain.penalty = penaltyRow
        ? {
            score_deduction: Number(penaltyRow.score_deduction || 0),
            position_delta: Number(penaltyRow.position_delta || 0),
            time_penalty_seconds: Number(penaltyRow.time_penalty_seconds || 0),
            suspension_days: Number(penaltyRow.suspension_days || 0),
            fine_amount: Number(penaltyRow.fine_amount || 0),
            disqualified: penaltyRow.disqualified === true
        }
        : {};
    return plain;
}

/**
 * Wrap a Sequelize RaceResult row with legacy-shaped helpers:
 *   - `result.applied_violation_ids[]`
 *   - `result.penalty_snapshot_violation_ids[]`
 * were arrays of object references in the legacy schema; in Sequelize they
 * are child rows in `race_result_applied_violations` and
 * `race_result_penalty_snapshot_violations`.
 *
 * We eager-load both child tables and re-expose the violation IDs as plain
 * arrays on the parent row so existing call sites work unchanged.
 */
async function loadRaceResultsWithSnapshot(raceId) {
    const { Op } = require('sequelize');
    const { RaceResult, RaceResultAppliedViolation, RaceResultPenaltySnapshotViolation } = getModels();

    const rows = await RaceResult.findAll({
        where: { race_id: raceId },
        include: [
            { model: RaceResultAppliedViolation, as: 'applied_violations', required: false },
            { model: RaceResultPenaltySnapshotViolation, as: 'penalty_snapshot_violations', required: false }
        ]
    });

    return rows.map((row) => {
        const plain = toPlain(row);
        plain.applied_violation_ids = (plain.applied_violations || []).map((v) => v.violation_id);
        plain.penalty_snapshot_violation_ids = (plain.penalty_snapshot_violations || []).map((v) => v.violation_id);
        return plain;
    });
}

function hasRole(req, role) {
    return (req.roles || req.auth.roles || []).includes(role);
}

function sameId(first, second) {
    return first && second && first.toString() === second.toString();
}

function getDocumentId(value) {
    return value && (value._id || value);
}

function sortedIdStrings(values) {
    return (values || []).map(function(value) {
        return String(getDocumentId(value));
    }).sort();
}

function sameIdSet(first, second) {
    const firstIds = sortedIdStrings(first);
    const secondIds = sortedIdStrings(second);

    return firstIds.length === secondIds.length && firstIds.every(function(id, index) {
        return id === secondIds[index];
    });
}

function penaltiesMatchCurrentSnapshot(results, confirmedViolations) {
    const violationIds = confirmedViolations.map(function(violation) {
        return violation._id;
    });

    return results.length > 0 && results.every(function(result) {
        return Boolean(result.penalties_applied_at) &&
            sameIdSet(result.penalty_snapshot_violation_ids, violationIds);
    });
}

async function getCurrentReferee(req) {
    const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

    if (!referee) {
        throw new ApiError(404, 'Race referee profile not found');
    }

    return referee;
}

async function ensureCanFinalizeRace(req, race) {
    if (hasRole(req, ROLE_NAMES.ADMIN)) {
        return getDocumentId(race.referee_id);
    }

    const referee = await getCurrentReferee(req);
    const assignedRefereeId = getDocumentId(race.referee_id);

    if (!assignedRefereeId || !sameId(assignedRefereeId, referee._id)) {
        throw new ApiError(403, 'You can only finalize races assigned to you');
    }

    return referee._id;
}

async function getRaceParticipants(req, raceId) {
    const race = await raceRepository.findById(raceId);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    await ensureCanFinalizeRace(req, race);
    const participantData = await raceEngineService.collectParticipantStatuses(race._id);

    return {
        race: participantData.race,
        participants: participantData.participants
    };
}

async function getRaceReadiness(req, raceId) {
    const race = await raceRepository.findById(raceId);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    const refereeId = await ensureCanFinalizeRace(req, race);

    if (!refereeId) {
        throw new ApiError(400, 'Race referee is required to finalize race');
    }

    const [participantData, submittedReport, unresolvedViolations, confirmedViolations, raceResults] = await Promise.all([
        raceEngineService.collectParticipantStatuses(race._id),
        refereeReportRepository.findOne({
            race_id: race._id,
            referee_id: refereeId,
            status: 'submitted'
        }),
        loadViolationsWithPenalty({
            race_id: race._id,
            status: { [require('sequelize').Op.in]: ['recorded', 'under_review'] }
        }),
        loadViolationsWithPenalty({
            race_id: race._id,
            status: { [require('sequelize').Op.in]: ['confirmed', 'resolved'] }
        }),
        loadRaceResultsWithSnapshot(race._id)
    ]);
    const eligibleParticipants = participantData.participants.filter(function(participant) {
        return participant.eligible;
    });
    const missingPostCheckHorseIds = eligibleParticipants
        .filter(function(participant) {
            return !participant.post_race_check;
        })
        .map(function(participant) {
            return getDocumentId(participant.horse).toString();
        });
    const underInvestigationHorseIds = eligibleParticipants
        .filter(function(participant) {
            return participant.post_race_check &&
                participant.post_race_check.status === HORSE_CHECK_STATUS.UNDER_INVESTIGATION;
        })
        .map(function(participant) {
            return getDocumentId(participant.horse).toString();
        });
    const raceDatePassed = DEMO_BYPASS_TIME_VALIDATIONS || (Boolean(race.race_date) && new Date(race.race_date).getTime() <= Date.now());
    const raceCompleted = ['completed', 'finished'].includes((race.status || '').toLowerCase());
    const ready = raceDatePassed &&
        race.registration_locked === true &&
        raceCompleted &&
        eligibleParticipants.length > 0 &&
        Boolean(submittedReport) &&
        missingPostCheckHorseIds.length === 0 &&
        underInvestigationHorseIds.length === 0 &&
        unresolvedViolations.length === 0;
    const lockedResults = raceResults.some(function(result) {
        return [RACE_RESULT_STATUS.CONFIRMED, RACE_RESULT_STATUS.PUBLISHED].includes(result.status);
    });
    const penaltiesApplied = lockedResults || penaltiesMatchCurrentSnapshot(raceResults, confirmedViolations);
    const submittedToAdmin = lockedResults || (
        raceResults.length > 0 && raceResults.every(function(result) {
            return Boolean(result.submitted_to_admin_at);
        })
    );

    return {
        race_id: race._id,
        race_status: race.status,
        registration_locked: race.registration_locked,
        race_date_passed: raceDatePassed,
        eligible_participant_count: eligibleParticipants.length,
        submitted_report_id: submittedReport ? submittedReport._id : null,
        missing_report: !submittedReport,
        missing_post_check_horse_ids: missingPostCheckHorseIds,
        under_investigation_horse_ids: underInvestigationHorseIds,
        unresolved_violation_ids: unresolvedViolations.map(function(violation) {
            return violation._id;
        }),
        confirmed_penalty_count: confirmedViolations.length,
        draft_result_count: raceResults.filter(function(result) {
            return result.status === RACE_RESULT_STATUS.DRAFT;
        }).length,
        penalties_applied: penaltiesApplied,
        submitted_to_admin: submittedToAdmin,
        ready_to_apply_penalties: ready && !lockedResults && !submittedToAdmin,
        ready_to_finalize: ready && penaltiesApplied && !submittedToAdmin && !lockedResults,
        ready: ready
    };
}

async function finalizeRace(req, raceId) {
    const readiness = await getRaceReadiness(req, raceId);

    if (!readiness.ready) {
        throw new ApiError(400, 'Race is not ready for finalization', readiness);
    }

    const [results, confirmedViolations] = await Promise.all([
        loadRaceResultsWithSnapshot(raceId),
        loadViolationsWithPenalty({
            race_id: raceId,
            status: { [require('sequelize').Op.in]: ['confirmed', 'resolved'] }
        })
    ]);

    if (!results.length) {
        throw new ApiError(409, 'Apply confirmed penalties before finalizing results');
    }

    if (results.some(function(result) {
        return result.status !== RACE_RESULT_STATUS.DRAFT;
    })) {
        throw new ApiError(409, 'Only draft results can be submitted to Admin');
    }

    if (!penaltiesMatchCurrentSnapshot(results, confirmedViolations)) {
        throw new ApiError(409, 'Confirmed penalties changed or have not been applied. Apply them again before finalizing');
    }

    const alreadySubmitted = results.every(function(result) {
        return Boolean(result.submitted_to_admin_at);
    });

    if (!alreadySubmitted) {
        const submittedAt = new Date();

        await raceResultRepository.updateMany(
            { race_id: raceId, status: RACE_RESULT_STATUS.DRAFT },
            {
                $set: {
                    submitted_to_admin_by: req.user._id,
                    submitted_to_admin_at: submittedAt
                }
            },
            { runValidators: true }
        );
    }

    return {
        race_id: readiness.race_id,
        referee_report_id: readiness.submitted_report_id,
        participant_count: readiness.eligible_participant_count,
        already_submitted: alreadySubmitted,
        results: await raceResultRepository.find({ race_id: raceId })
    };
}

async function createResult(req, payload) {
    let recordedBy = payload.recorded_by;

    if (!hasRole(req, ROLE_NAMES.ADMIN)) {
        const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

        if (!referee) {
            throw new ApiError(404, 'Race referee profile not found');
        }

        recordedBy = referee._id;
    }

    if (!recordedBy) {
        throw new ApiError(400, 'recorded_by is required');
    }

    const preRaceCheck = await horseCheckRepository.findOne({
        race_id: payload.race_id,
        horse_id: payload.horse_id,
        phase: HORSE_CHECK_PHASE.PRE_RACE
    });

    if (preRaceCheck && preRaceCheck.status !== HORSE_CHECK_STATUS.PASSED) {
        throw new ApiError(400, 'Race result cannot be recorded because pre-race horse check is not passed');
    }

    const result = await raceResultRepository.create({
        race_id: payload.race_id,
        horse_id: payload.horse_id,
        jockey_id: payload.jockey_id,
        position: payload.position,
        finish_time: payload.finish_time,
        score: payload.score,
        note: payload.note,
        status: RACE_RESULT_STATUS.DRAFT,
        recorded_by: recordedBy,
        recorded_at: new Date()
    });

    return {
        result: result
    };
}

async function listResults(req, query) {
    const filter = {};

    ['race_id', 'horse_id', 'jockey_id', 'recorded_by', 'status'].forEach(function(field) {
        if (query[field]) {
            filter[field] = query[field];
        }
    });

    if (hasRole(req, ROLE_NAMES.RACE_REFEREE) && !hasRole(req, ROLE_NAMES.ADMIN)) {
        const referee = await profileRepository.findRaceRefereeByUserId(req.user._id);

        if (!referee) {
            throw new ApiError(404, 'Race referee profile not found');
        }

        filter.recorded_by = referee._id;
    }

    if (hasRole(req, ROLE_NAMES.ADMIN)) {
        const { Op } = require('sequelize');
        filter[Op.or] = [
            { submitted_to_admin_at: { [Op.ne]: null } },
            { status: { [Op.in]: [RACE_RESULT_STATUS.CONFIRMED, RACE_RESULT_STATUS.PUBLISHED] } }
        ];
    }

    if (hasRole(req, ROLE_NAMES.SPECTATOR) && !hasRole(req, ROLE_NAMES.ADMIN) && !hasRole(req, ROLE_NAMES.RACE_REFEREE)) {
        filter.status = RACE_RESULT_STATUS.PUBLISHED;
    }

    return {
        results: await raceResultRepository.find(filter)
    };
}

async function getResult(req, id) {
    const result = await raceResultRepository.findById(id);

    if (!result) {
        throw new ApiError(404, 'Race result not found');
    }

    if (!hasRole(req, ROLE_NAMES.ADMIN)) {
        const referee = await getCurrentReferee(req);
        const assignedRefereeId = result.race_id && getDocumentId(result.race_id.referee_id);
        const recordedById = getDocumentId(result.recorded_by);

        if (!sameId(assignedRefereeId, referee._id) && !sameId(recordedById, referee._id)) {
            throw new ApiError(403, 'You can only view results for races assigned to you');
        }
    }

    return {
        result: result
    };
}

async function updateResult(req, id, payload) {
    const result = await raceResultRepository.findById(id);

    if (!result) {
        throw new ApiError(404, 'Race result not found');
    }

    if (result.status !== RACE_RESULT_STATUS.DRAFT) {
        throw new ApiError(400, 'Only draft results can be updated');
    }

    if (result.submitted_to_admin_at) {
        throw new ApiError(409, 'Results submitted to Admin are locked until a correction is requested');
    }

    if (!hasRole(req, ROLE_NAMES.ADMIN)) {
        const referee = await getCurrentReferee(req);

        if (
            !sameId(getDocumentId(result.recorded_by), referee._id)
        ) {
            throw new ApiError(403, 'Only draft results can be updated by the recording referee');
        }
    }

    const updateData = Object.assign({}, payload);

    delete updateData.status;
    delete updateData.confirmed_by;
    delete updateData.confirmed_at;
    delete updateData.published_at;

    if (payload.position !== undefined) {
        updateData.raw_position = payload.position;
        updateData.final_position = payload.position;
    }

    if (payload.finish_time !== undefined) {
        updateData.raw_finish_time = payload.finish_time;
        updateData.final_finish_time = payload.finish_time;
    }

    if (payload.score !== undefined) {
        updateData.raw_score = payload.score;
        updateData.final_score = payload.score;
    }

    if (payload.position !== undefined || payload.finish_time !== undefined || payload.score !== undefined) {
        updateData.applied_violation_ids = [];
        updateData.penalty_snapshot_violation_ids = [];
        updateData.penalties_applied_by = null;
        updateData.penalties_applied_at = null;
        updateData.submitted_to_admin_by = null;
        updateData.submitted_to_admin_at = null;
    }

    const updatedResult = await raceResultRepository.updateById(id, updateData);

    return {
        result: updatedResult
    };
}

function getResultNumber(primary, fallback) {
    if (primary !== undefined && primary !== null) {
        return Number(primary);
    }

    return fallback !== undefined && fallback !== null ? Number(fallback) : 0;
}

function violationMatchesResult(violation, result) {
    const horseMatches = violation.horse_id &&
        sameId(getDocumentId(violation.horse_id), getDocumentId(result.horse_id));
    const jockeyMatches = violation.jockey_id &&
        sameId(getDocumentId(violation.jockey_id), getDocumentId(result.jockey_id));

    return horseMatches || jockeyMatches;
}

/**
 * Fetch the data needed to calculate penalties. The original legacy-ORM code
 * passed a `session` parameter and called `.session(session)` per query; in
 * Sequelize the transaction is at the unit-of-work boundary, so we accept
 * the session argument for backwards-compatibility and ignore it.
 */
async function getPenaltyData(raceId, _session) {
    const { Op } = require('sequelize');
    const unresolvedViolations = await loadViolationsWithPenalty({
        race_id: raceId,
        status: { [Op.in]: ['recorded', 'under_review'] }
    });
    const results = await loadRaceResultsWithSnapshot(raceId).then((rows) => rows.filter(function(row) {
        return row.status === RACE_RESULT_STATUS.DRAFT;
    }));
    const violations = await loadViolationsWithPenalty({
        race_id: raceId,
        status: { [Op.in]: ['confirmed', 'resolved'] }
    });

    if (unresolvedViolations.length) {
        throw new ApiError(400, 'All race violations must be confirmed or dismissed first', {
            violation_ids: unresolvedViolations.map(function(violation) {
                return violation._id;
            })
        });
    }

    if (!results.length) {
        throw new ApiError(404, 'Draft race results not found');
    }

    return { results: results, violations: violations };
}

function buildPenaltyUpdates(results, violations) {
    const candidates = results.map(function(result) {

        const rawPosition = getResultNumber(result.raw_position, result.position);
        const rawFinishTime = getResultNumber(result.raw_finish_time, result.finish_time);
        const rawScore = getResultNumber(result.raw_score, result.score);
        const matchingViolations = violations.filter(function(violation) {
            return violationMatchesResult(violation, result);
        });
        const penalty = matchingViolations.reduce(function(total, violation) {
            const value = violation.penalty || {};

            total.score_deduction += Number(value.score_deduction || 0);
            total.position_delta += Number(value.position_delta || 0);
            total.time_penalty_seconds += Number(value.time_penalty_seconds || 0);
            total.disqualified = total.disqualified || value.disqualified === true;
            return total;
        }, {
            score_deduction: 0,
            position_delta: 0,
            time_penalty_seconds: 0,
            disqualified: false
        });

        return {
            result: result,
            raw_position: rawPosition,
            raw_finish_time: rawFinishTime,
            raw_score: rawScore,
            final_finish_time: Number((rawFinishTime + penalty.time_penalty_seconds).toFixed(3)),
            final_score: Math.max(0, rawScore - penalty.score_deduction),
            provisional_position: rawPosition + penalty.position_delta,
            position_delta: penalty.position_delta,
            disqualified: penalty.disqualified,
            violation_ids: matchingViolations.map(function(violation) {
                return violation._id;
            })
        };
    });
    const rankedCandidates = candidates
        .filter(function(candidate) {
            return !candidate.disqualified;
        })
        .sort(function(first, second) {
            return first.provisional_position - second.provisional_position ||
                first.position_delta - second.position_delta ||
                first.final_finish_time - second.final_finish_time;
        });

    rankedCandidates.forEach(function(candidate, index) {
        candidate.final_position = index + 1;
    });

    candidates.filter(function(candidate) {
        return candidate.disqualified;
    }).forEach(function(candidate) {
        candidate.final_position = null;
    });

    return candidates.map(function(candidate) {
        return {
            result_id: candidate.result._id,
            data: {
                raw_position: candidate.raw_position,
                raw_finish_time: candidate.raw_finish_time,
                raw_score: candidate.raw_score,
                final_position: candidate.final_position,
                final_finish_time: candidate.final_finish_time,
                final_score: candidate.final_score,
                position: candidate.final_position,
                finish_time: candidate.final_finish_time,
                score: candidate.final_score,
                applied_violation_ids: candidate.violation_ids
            }
        };
    });
}

async function calculateAndApplyPenaltiesInSession(raceId, _session, appliedByUserId) {
    const { Op, literal } = require('sequelize');
    const penaltyData = await getPenaltyData(raceId, _session);
    const updates = buildPenaltyUpdates(penaltyData.results, penaltyData.violations);
    const appliedAt = new Date();
    const snapshotViolationIds = penaltyData.violations.map(function(violation) {
        return violation._id;
    });

    for (const update of updates) {
        update.data.penalty_snapshot_violation_ids = snapshotViolationIds;
        update.data.penalties_applied_by = appliedByUserId;
        update.data.penalties_applied_at = appliedAt;
        update.data.submitted_to_admin_by = null;
        update.data.submitted_to_admin_at = null;

        await raceResultRepository.updateById(update.result_id, update.data);
    }

    return updates;
}

async function calculateAndApplyPenalties(raceId, appliedByUserId) {
    const sequelize = getSequelize();
    let updates;

    await sequelize.transaction(async () => {
        updates = await calculateAndApplyPenaltiesInSession(raceId, null, appliedByUserId);
    });

    return {
        race_id: raceId,
        results: await raceResultRepository.find({ race_id: raceId })
    };
}

async function assertAllRaceResultsStatus(raceId, expectedStatus, _session) {
    const results = await loadRaceResultsWithSnapshot(raceId);

    if (!results.length) {
        throw new ApiError(404, 'Race results not found');
    }

    const invalidResults = results.filter(function(result) {
        return result.status !== expectedStatus;
    });

    if (invalidResults.length) {
        throw new ApiError(400, 'All race results must be ' + expectedStatus, {
            result_ids: invalidResults.map(function(result) {
                return result._id;
            })
        });
    }

    return results;
}

async function applyDisciplinaryPenalties(adminUserId, raceId, _session) {
    const { Op } = require('sequelize');
    const violations = await loadViolationsWithPenalty({
        race_id: raceId,
        status: { [Op.in]: ['confirmed', 'resolved'] },
        jockey_id: { [Op.ne]: null },
        discipline_applied_at: null
    });
    const now = new Date();

    for (const violation of violations) {
        const penalty = violation.penalty || {};
        const suspensionDays = Number(penalty.suspension_days || 0);
        const fineAmount = Number(penalty.fine_amount || 0);

        if (suspensionDays <= 0 && fineAmount <= 0) {
            continue;
        }

        const jockey = await loadJockeyById(violation.jockey_id);

        if (!jockey) {
            throw new ApiError(404, 'Jockey profile not found for disciplinary penalty');
        }

        const updateFields = {};
        if (suspensionDays > 0) {
            const currentSuspension = jockey.suspended_until && new Date(jockey.suspended_until) > now
                ? new Date(jockey.suspended_until)
                : now;
            updateFields.suspended_until = new Date(currentSuspension.getTime() + suspensionDays * 86400000);
            updateFields.disciplinary_status = 'suspended';
        }

        if (fineAmount > 0) {
            updateFields.outstanding_fine_amount = Number(jockey.outstanding_fine_amount || 0) + fineAmount;
        }

        await updateJockeyById(jockey._id, updateFields);

        // Persist discipline-applied markers on the violation row.
        await updateViolationDiscipline(violation._id, adminUserId, now);
    }
}

async function updateJockeyById(jockeyId, fields) {
    const { Jockey } = getModels();
    await Jockey.update(fields, { where: { id: jockeyId } });
}

async function loadJockeyById(id) {
    const { Jockey } = getModels();
    return toPlain(await Jockey.findByPk(id));
}

async function updateViolationDiscipline(violationId, adminUserId, now) {
    const { Violation } = getModels();
    await Violation.update({
        discipline_applied_at: now,
        discipline_applied_by: adminUserId
    }, { where: { id: violationId } });
}

async function applyRacePenalties(req, raceId) {
    const race = await raceRepository.findById(raceId);

    if (!race) {
        throw new ApiError(404, 'Race not found');
    }

    await ensureCanFinalizeRace(req, race);
    const readiness = await getRaceReadiness(req, raceId);

    if (!readiness.ready) {
        throw new ApiError(400, 'Race is not ready to apply penalties', readiness);
    }

    const existingResults = await loadRaceResultsWithSnapshot(race._id);

    if (existingResults.some(function(result) {
        return result.status !== RACE_RESULT_STATUS.DRAFT || Boolean(result.submitted_to_admin_at);
    })) {
        throw new ApiError(409, 'Submitted, confirmed, or published results cannot be recalculated');
    }

    let engineResult = null;

    if (!existingResults.length) {
        engineResult = await raceEngineService.generateDraftResults(raceId);
    }

    const penaltyResult = await calculateAndApplyPenalties(race._id, req.user._id);

    return Object.assign({}, penaltyResult, {
        engine: engineResult
    });
}

async function confirmRaceResults(adminUserId, raceId) {
    const sequelize = getSequelize();
    const { Op } = require('sequelize');

    await sequelize.transaction(async () => {
        const draftResults = await assertAllRaceResultsStatus(raceId, RACE_RESULT_STATUS.DRAFT, null);
        const submittedResults = await loadRaceResultsWithSnapshot(raceId).then((rows) => rows.filter(function(row) {
            return row.submitted_to_admin_at !== null && row.submitted_to_admin_at !== undefined;
        }));

        if (submittedResults.length !== draftResults.length) {
            throw new ApiError(409, 'Referee must apply confirmed penalties and submit final results before Admin confirmation');
        }

        const confirmedViolations = await loadViolationsWithPenalty({
            race_id: raceId,
            status: { [Op.in]: ['confirmed', 'resolved'] }
        });

        if (!penaltiesMatchCurrentSnapshot(submittedResults, confirmedViolations)) {
            throw new ApiError(409, 'Submitted result penalties are stale. Return the results to the Referee for recalculation');
        }

        const pendingCorrections = await loadRaceResultsWithSnapshot(raceId).then((rows) => rows.filter(function(row) {
            return row.correction_requested === true;
        }));

        if (pendingCorrections.length) {
            throw new ApiError(400, 'Race result correction must be resolved before confirmation', {
                result_ids: pendingCorrections.map(function(result) {
                    return result._id;
                })
            });
        }

        await applyDisciplinaryPenalties(adminUserId, raceId, null);
        await raceResultRepository.updateMany(
            { race_id: raceId, status: RACE_RESULT_STATUS.DRAFT },
            {
                status: RACE_RESULT_STATUS.CONFIRMED,
                confirmed_by: adminUserId,
                confirmed_at: new Date()
            },
            { runValidators: true }
        );
    });

    return {
        race_id: raceId,
        results: await raceResultRepository.find({ race_id: raceId })
    };
}

async function requestRaceCorrection(adminUserId, raceId, payload) {
    const note = String(payload.correction_note || payload.note || '').trim();

    if (!note) {
        throw new ApiError(400, 'Validation failed', [
            { field: 'correction_note', message: 'correction_note is required' }
        ]);
    }

    const sequelize = getSequelize();

    await sequelize.transaction(async () => {
        const results = await loadRaceResultsWithSnapshot(raceId);

        if (!results.length) {
            throw new ApiError(404, 'Race results not found');
        }

        const publishedResults = results.filter(function(result) {
            return result.status === RACE_RESULT_STATUS.PUBLISHED;
        });

        if (publishedResults.length) {
            throw new ApiError(400, 'Published race results cannot be sent back for correction', {
                result_ids: publishedResults.map(function(result) {
                    return result._id;
                })
            });
        }

        const now = new Date();

        await raceResultRepository.updateMany(
            { race_id: raceId, status: { $in: [RACE_RESULT_STATUS.DRAFT, RACE_RESULT_STATUS.CONFIRMED] } },
            {
                $set: {
                    status: RACE_RESULT_STATUS.DRAFT,
                    correction_requested: true,
                    correction_note: note,
                    correction_requested_by: adminUserId,
                    correction_requested_at: now
                },
                $unset: {
                    confirmed_by: '',
                    confirmed_at: '',
                    published_by: '',
                    published_at: '',
                    penalties_applied_by: '',
                    penalties_applied_at: '',
                    penalty_snapshot_violation_ids: '',
                    submitted_to_admin_by: '',
                    submitted_to_admin_at: '',
                    correction_resolved_by: '',
                    correction_resolved_at: ''
                }
            },
            { runValidators: true }
        );
    });

    return {
        race_id: raceId,
        results: await raceResultRepository.find({ race_id: raceId })
    };
}

async function resolveRaceCorrection(adminUserId, raceId) {
    const sequelize = getSequelize();

    await sequelize.transaction(async () => {
        const results = await loadRaceResultsWithSnapshot(raceId);

        if (!results.length) {
            throw new ApiError(404, 'Race results not found');
        }

        const publishedResults = results.filter(function(result) {
            return result.status === RACE_RESULT_STATUS.PUBLISHED;
        });

        if (publishedResults.length) {
            throw new ApiError(400, 'Published race results cannot be updated for correction resolution', {
                result_ids: publishedResults.map(function(result) {
                    return result._id;
                })
            });
        }

        await raceResultRepository.updateMany(
            { race_id: raceId, correction_requested: true },
            {
                $set: {
                    correction_requested: false,
                    correction_resolved_by: adminUserId,
                    correction_resolved_at: new Date()
                }
            },
            { runValidators: true }
        );
    });

    return {
        race_id: raceId,
        results: await raceResultRepository.find({ race_id: raceId })
    };
}

async function publishRaceResults(adminUserId, raceId) {
    const sequelize = getSequelize();
    let prizeAwards = null;
    let betSettlement = null;
    let ratingUpdate = null;

    await sequelize.transaction(async () => {
        await assertAllRaceResultsStatus(raceId, RACE_RESULT_STATUS.CONFIRMED, null);
        await raceResultRepository.updateMany(
            { race_id: raceId, status: RACE_RESULT_STATUS.CONFIRMED },
            {
                status: RACE_RESULT_STATUS.PUBLISHED,
                published_by: adminUserId,
                published_at: new Date()
            },
            { runValidators: true }
        );
        ratingUpdate = await horseRatingService.applyPublishedRaceRatings(raceId, adminUserId, { session: null });
        prizeAwards = await prizeService.calculateRacePrizeAwards(raceId, adminUserId, { session: null });
    });

    try {
        betSettlement = await betService.settleRaceBets(raceId, adminUserId);
    } catch (error) {
        betSettlement = {
            status: 'failed',
            message: error.message,
            retry_endpoint: '/api/bets/races/' + raceId + '/settle'
        };
    }

    return {
        race_id: raceId,
        results: await raceResultRepository.find({ race_id: raceId }),
        prize_awards: prizeAwards,
        rating_update: ratingUpdate,
        bet_settlement: betSettlement
    };
}

module.exports = {
    applyRacePenalties,
    buildPenaltyUpdates,
    createResult,
    confirmRaceResults,
    finalizeRace,
    getRaceParticipants,
    getRaceReadiness,
    listResults,
    getResult,
    updateResult,
    requestRaceCorrection,
    resolveRaceCorrection,
    publishRaceResults
};
