const crypto = require("crypto");
const mongoose = require("mongoose");

const ApiError = require("../utils/ApiError");
const {
  ASSIGNMENT_STATUS,
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  RACE_RESULT_STATUS,
  REGISTRATION_STATUS,
} = require("../constants/statuses");
const {
  HorseCheck,
  JockeyAssignment,
  Race,
  RaceResult,
  Registration,
} = require("../models");
const raceEngineRunRepository = require("../repositories/raceEngineRunRepository");
const raceRepository = require("../repositories/raceRepository");
const raceRunRepository = require("../repositories/raceRunRepository");

const LOCK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DEMO_BYPASS_TIME_VALIDATIONS = String(process.env.DEMO_BYPASS_TIME_VALIDATIONS || '').toLowerCase() === 'true';
const RUNNING_STALE_MS = 15 * 60 * 1000;
const ENGINE_RUN_STATUS = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
};
const COMPLETED_RACE_STATUSES = ["completed", "finished"];

function getRaceId(race) {
  return race && (race._id || race.id);
}

function calculateRegistrationLockAt(race) {
  if (!race || !race.race_date) {
    return null;
  }

  return new Date(new Date(race.race_date).getTime() - LOCK_OFFSET_MS);
}

function getEffectiveRegistrationLockAt(race) {
  return race.registration_lock_at || calculateRegistrationLockAt(race);
}

function assertRegistrationOpen(race, currentTime) {
  const now = currentTime || new Date();
  const registrationLockAt = getEffectiveRegistrationLockAt(race);

  if (race.registration_locked) {
    throw new ApiError(400, "Race registrations are locked");
  }

  if (!DEMO_BYPASS_TIME_VALIDATIONS &&
    registrationLockAt &&
    now.getTime() >= new Date(registrationLockAt).getTime()
  ) {
    throw new ApiError(400, "Race registrations are locked");
  }

  return true;
}

function isRunStale(run, currentTime) {
  const now = currentTime || new Date();
  const updatedAt = run.updated_at || run.started_at;

  if (!updatedAt) {
    return true;
  }

  return now.getTime() - new Date(updatedAt).getTime() > RUNNING_STALE_MS;
}

function getRunAction(run, currentTime) {
  if (!run) {
    return "create";
  }

  if (run.status === ENGINE_RUN_STATUS.COMPLETED) {
    return "skip_completed";
  }

  if (run.status === ENGINE_RUN_STATUS.FAILED) {
    return "retry";
  }

  if (run.status === ENGINE_RUN_STATUS.RUNNING) {
    return isRunStale(run, currentTime)
      ? "retry_stale_running"
      : "skip_running";
  }

  return "retry";
}

function getScore(position) {
  if (position === 1) {
    return 100;
  }

  if (position === 2) {
    return 90;
  }

  if (position === 3) {
    return 80;
  }

  return Math.max(50, 100 - position * 10);
}

function createSeededRandom(seed) {
  const digest = crypto.createHash("sha256").update(String(seed)).digest();
  let state = digest.readUInt32LE(0);

  return function seededRandom() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function getObjectId(value) {
  return value && (value._id || value);
}

function sameId(first, second) {
  return first && second && first.toString() === second.toString();
}

function getRaceRandom(raceId) {
  if (!process.env.RACE_ENGINE_RANDOM_SEED) {
    return Math.random;
  }

  return createSeededRandom(process.env.RACE_ENGINE_RANDOM_SEED + ':' + raceId);
}

function getFinishTime(position, random) {
  const baseTime = 60;
  const positionGap = (position - 1) * 0.5;
  const randomFactor = (random || Math.random)() * 0.3;

  return Number((baseTime + positionGap + randomFactor).toFixed(3));
}

function shuffle(items, random) {
  const shuffled = items.slice();
  const randomValue = random || Math.random;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomValue() * (index + 1));
    const current = shuffled[index];

    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function addLatestHorseCheck(latestByHorse, horseCheck) {
  const horseId = horseCheck.horse_id && horseCheck.horse_id.toString();
  const existingCheck = latestByHorse.get(horseId);

  if (!horseId) {
    return;
  }

  if (
    !existingCheck ||
    new Date(horseCheck.checked_at || 0) >
      new Date(existingCheck.checked_at || 0)
  ) {
    latestByHorse.set(horseId, horseCheck);
  }
}

async function getRaceOrThrow(raceId, session) {
  const query = raceRepository.findById(raceId);

  if (session && query.session) {
    query.session(session);
  }

  const race = await query;

  if (!race) {
    throw new ApiError(404, "Race not found");
  }

  return race;
}

async function lockRace(raceId) {
  const session = await mongoose.startSession();

  try {
    let response;

    await session.withTransaction(async function () {
      const race = await Race.findById(raceId).session(session);

      if (!race) {
        throw new ApiError(404, "Race not found");
      }

      const registrationLockAt = getEffectiveRegistrationLockAt(race);

      if (!registrationLockAt) {
        throw new ApiError(400, "race_date is required to lock registrations");
      }

      if (!DEMO_BYPASS_TIME_VALIDATIONS && new Date(registrationLockAt).getTime() > Date.now()) {
        throw new ApiError(400, "Registration lock time has not been reached");
      }

      if (race.registration_locked) {
        response = {
          race: race,
          locked: false,
        };
        return;
      }

      race.registration_locked = true;
      race.registration_lock_at = registrationLockAt;
      await race.save({ session: session });

      response = {
        race: race,
        locked: true,
      };
    });

    return response;
  } finally {
    await session.endSession();
  }
}

async function collectParticipantStatuses(raceId, options) {
  const session = options && options.session;
  const race = await getRaceOrThrow(raceId, session);
  const registrations = await Registration.find({
    race_id: raceId,
    status: REGISTRATION_STATUS.APPROVED,
  })
    .populate({
      path: "horse_id",
      populate: {
        path: "owner_id",
        populate: {
          path: "user_id",
        },
      },
    })
    .session(session || null);
  const horseIds = registrations
    .map(function (registration) {
      return (
        registration.horse_id &&
        (registration.horse_id._id || registration.horse_id)
      );
    })
    .filter(Boolean);

  if (!horseIds.length) {
    return {
      race: race,
      participants: [],
    };
  }

  const assignmentQuery = JockeyAssignment.find({
    race_id: raceId,
    horse_id: {
      $in: horseIds,
    },
    assignment_type: "primary",
    status: ASSIGNMENT_STATUS.ACCEPTED,
  })
    .sort({ invited_at: -1 })
    .populate({
      path: "jockey_id",
      populate: {
        path: "user_id",
      },
    });
  const horseCheckQuery = HorseCheck.find({
    race_id: raceId,
    horse_id: {
      $in: horseIds,
    },
  }).sort({ checked_at: -1 });

  if (session) {
    assignmentQuery.session(session);
    horseCheckQuery.session(session);
  }

  const assignments = await assignmentQuery;
  const horseChecks = await horseCheckQuery;

  const assignmentByHorse = new Map();
  const latestPreCheckByHorse = new Map();
  const latestPostCheckByHorse = new Map();

  assignments.forEach(function (assignment) {
    const horseId = assignment.horse_id.toString();

    if (!assignmentByHorse.has(horseId)) {
      assignmentByHorse.set(horseId, assignment);
    }
  });

  horseChecks.forEach(function (horseCheck) {
    if (horseCheck.phase === HORSE_CHECK_PHASE.PRE_RACE) {
      addLatestHorseCheck(latestPreCheckByHorse, horseCheck);
    }

    if (horseCheck.phase === HORSE_CHECK_PHASE.POST_RACE) {
      addLatestHorseCheck(latestPostCheckByHorse, horseCheck);
    }
  });

  const participants = registrations.map(function (registration) {
    const horse = registration.horse_id;
    const horseId = horse && (horse._id || horse);
    const assignment = horseId
      ? assignmentByHorse.get(horseId.toString())
      : null;
    const preRaceCheck = horseId
      ? latestPreCheckByHorse.get(horseId.toString())
      : null;
    const postRaceCheck = horseId
      ? latestPostCheckByHorse.get(horseId.toString())
      : null;
    const blockers = [];

    if (!assignment || assignment.status !== ASSIGNMENT_STATUS.ACCEPTED) {
      blockers.push("accepted_jockey_assignment_required");
    }

    if (
      assignment &&
      assignment.jockey_id &&
      assignment.jockey_id.suspended_until &&
      new Date(assignment.jockey_id.suspended_until).getTime() > Date.now()
    ) {
      blockers.push("jockey_suspension_active");
    }

    if (
      !preRaceCheck ||
      preRaceCheck.status !== HORSE_CHECK_STATUS.PASSED ||
      preRaceCheck.is_eligible !== true
    ) {
      blockers.push("passed_pre_race_check_required");
    }

    return {
      registration: registration,
      horse: horse,
      jockey: assignment ? assignment.jockey_id : null,
      assignment: assignment,
      pre_race_check: preRaceCheck || null,
      post_race_check: postRaceCheck || null,
      eligible: blockers.length === 0,
      blockers: blockers,
    };
  });

  return {
    race: race,
    participants: participants,
  };
}

function buildRaceOrder(raceId, participants) {
  const random = getRaceRandom(raceId);
  const rankedParticipants = shuffle(participants, random);

  return rankedParticipants.map(function(participant, index) {
    const position = index + 1;
    const finishTime = getFinishTime(position, random);
    const score = getScore(position);

    return {
      participant: participant,
      horse_id: getObjectId(participant.horse),
      jockey_id: getObjectId(participant.jockey),
      assignment_id: getObjectId(participant.assignment),
      position: position,
      finish_time: finishTime,
      score: score
    };
  });
}

function getLane(participant, fallback) {
  if (participant.registration && participant.registration.draw !== undefined) {
    return participant.registration.draw;
  }

  if (participant.registration && participant.registration.lane !== undefined) {
    return participant.registration.lane;
  }

  if (participant.assignment && participant.assignment.lane !== undefined) {
    return participant.assignment.lane;
  }

  return fallback;
}

function buildRaceRunPayload(raceId, userId, participants, raceOrder) {
  return {
    race_id: raceId,
    status: 'generated',
    generated_by: userId,
    generated_at: new Date(),
    seed: process.env.RACE_ENGINE_RANDOM_SEED || null,
    participants: participants.map(function(participant, index) {
      return {
        horse_id: getObjectId(participant.horse),
        jockey_id: getObjectId(participant.jockey),
        assignment_id: getObjectId(participant.assignment),
        lane: getLane(participant, index + 1),
        seed_position: index + 1
      };
    }),
    finish_order: raceOrder.map(function(item) {
      return {
        horse_id: item.horse_id,
        jockey_id: item.jockey_id,
        position: item.position,
        finish_time: item.finish_time,
        score: item.score
      };
    })
  };
}

async function collectParticipants(raceId, options) {
  const participantData = await collectParticipantStatuses(raceId, options);
  const participants = participantData.participants.reduce(function(items, participant) {
    if (!participant.eligible) {
      return items;
    }

    items.push({
      registration: participant.registration,
      horse: participant.horse,
      jockey: participant.jockey,
      assignment: participant.assignment,
      horse_check: participant.pre_race_check,
      post_race_check: participant.post_race_check,
    });

    return items;
  }, []);

  return {
    race: participantData.race,
    participants: participants,
  };
}

async function markStaleRunFailed(run) {
  return raceEngineRunRepository.updateById(run._id, {
    status: ENGINE_RUN_STATUS.FAILED,
    completed_at: new Date(),
    error: "Race Engine run timed out",
  });
}

async function prepareRun(raceId) {
  const existingRun = await raceEngineRunRepository.findOne({
    race_id: raceId,
  });
  const action = getRunAction(existingRun);

  if (action === "skip_completed") {
    return {
      run: existingRun,
      created: false,
      skipped: true,
      reason: "Race already processed",
    };
  }

  if (action === "skip_running") {
    return {
      run: existingRun,
      created: false,
      skipped: true,
      reason: "Race processing is already running",
    };
  }

  if (action === "retry_stale_running") {
    await markStaleRunFailed(existingRun);
  }

  return {
    run: existingRun,
    created: false,
    skipped: false,
    reason: action,
  };
}

async function startRun(raceId, existingRun, session) {
  const runData = {
    race_id: raceId,
    engine_run_id: existingRun
      ? existingRun.engine_run_id
      : crypto.randomUUID(),
    status: ENGINE_RUN_STATUS.RUNNING,
    started_at: new Date(),
    completed_at: undefined,
    error: undefined,
  };

  if (existingRun) {
    return raceEngineRunRepository.updateById(existingRun._id, runData, {
      session: session,
    });
  }

  try {
    return await raceEngineRunRepository.create(runData, { session: session });
  } catch (error) {
    if (error && error.code === 11000) {
      const concurrentRun = await raceEngineRunRepository.findOne(
        { race_id: raceId },
        { session: session },
      );

      if (
        getRunAction(concurrentRun) === "skip_completed" ||
        getRunAction(concurrentRun) === "skip_running"
      ) {
        throw new ApiError(
          409,
          "Race processing is already running or completed",
        );
      }
    }

    throw error;
  }
}

async function completeRun(run, session) {
  return raceEngineRunRepository.updateById(
    run._id,
    {
      status: ENGINE_RUN_STATUS.COMPLETED,
      completed_at: new Date(),
      error: undefined,
    },
    { session: session },
  );
}

async function failRun(run, error) {
  return raceEngineRunRepository.updateById(run._id, {
    status: ENGINE_RUN_STATUS.FAILED,
    completed_at: new Date(),
    error: error.message,
  });
}

async function generateDraftResults(raceId) {
  const runState = await prepareRun(raceId);

  if (runState.skipped) {
    return {
      skipped: true,
      reason: runState.reason,
      run: runState.run,
      results: [],
    };
  }

  const session = await mongoose.startSession();
  let activeRun;

  try {
    activeRun = await startRun(raceId, runState.run);

    let response;

    await session.withTransaction(async function () {
      const race = await Race.findById(raceId).session(session);

      if (!race) {
        throw new ApiError(404, "Race not found");
      }

      if (!race.referee_id) {
        throw new ApiError(
          400,
          "Race referee is required to generate race results",
        );
      }

      if (!COMPLETED_RACE_STATUSES.includes((race.status || "").toLowerCase())) {
        throw new ApiError(
          400,
          "Race must be completed before draft results can be generated",
        );
      }

      const registrationLockAt = getEffectiveRegistrationLockAt(race);

      if (!registrationLockAt) {
        throw new ApiError(
          400,
          "race_date is required to generate race results",
        );
      }

      if (!DEMO_BYPASS_TIME_VALIDATIONS && new Date(registrationLockAt).getTime() > Date.now()) {
        throw new ApiError(400, "Registration lock time has not been reached");
      }

      const existingResultCount = await RaceResult.countDocuments({
        race_id: raceId,
      }).session(session);

      if (existingResultCount > 0) {
        race.registration_locked = true;
        race.registration_lock_at = registrationLockAt;
        await race.save({ session: session });

        const completedRun = await completeRun(activeRun, session);

        response = {
          skipped: true,
          reason: "Race results already exist",
          run: completedRun,
          results: [],
        };
        return;
      }

      const participantData = await collectParticipants(raceId, {
        session: session,
      });

      if (!participantData.participants.length) {
        throw new ApiError(400, "Race has no eligible participants");
      }

      const raceRun = await getProvisionalRaceRun(raceId, { session: session });
      const raceOrderFromRun = buildOrderFromRaceRun(
        participantData.participants,
        raceRun
      );
      const raceOrder = raceOrderFromRun.length === participantData.participants.length
        ? raceOrderFromRun
        : buildRaceOrder(raceId, participantData.participants);
      const results = raceOrder.map(function (orderItem) {
        const position = orderItem.position;
        const finishTime = orderItem.finish_time;
        const score = orderItem.score;

        return {
          race_id: raceId,
          horse_id: orderItem.horse_id,
          jockey_id: orderItem.jockey_id,
          position: position,
          finish_time: finishTime,
          score: score,
          raw_position: position,
          raw_finish_time: finishTime,
          raw_score: score,
          final_position: position,
          final_finish_time: finishTime,
          final_score: score,
          applied_violation_ids: [],
          status: RACE_RESULT_STATUS.DRAFT,
          recorded_by: race.referee_id._id || race.referee_id,
          recorded_at: new Date(),
        };
      });

      if (results.length) {
        await RaceResult.insertMany(results, {
          ordered: true,
          session: session,
        });
      }

      if (raceRun && raceRun._id) {
        await raceRunRepository.updateById(
          raceRun._id,
          { status: 'used' },
          { session: session }
        );
      }

      race.registration_locked = true;
      race.registration_lock_at = registrationLockAt;
      await race.save({ session: session });

      const completedRun = await completeRun(activeRun, session);

      response = {
        skipped: false,
        run: completedRun,
        results: results,
      };
    });

    return response;
  } catch (error) {
    if (activeRun && activeRun._id) {
      await failRun(activeRun, error);
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

async function ensureRaceRegistrationIsUnlocked(raceId) {
  const race = await getRaceOrThrow(raceId);

  assertRegistrationOpen(race);

  return race;
}

async function findRacesReadyForLock(now) {
  const currentTime = now || new Date();
  const raceDateCutoff = new Date(currentTime.getTime() + LOCK_OFFSET_MS);

  return Race.find({
    registration_locked: false,
    $or: [
      {
        registration_lock_at: {
          $lte: currentTime,
        },
      },
      {
        registration_lock_at: {
          $exists: false,
        },
        race_date: {
          $lte: raceDateCutoff,
        },
      },
      {
        registration_lock_at: null,
        race_date: {
          $lte: raceDateCutoff,
        },
      },
    ],
  });
}

async function processDueRace(race) {
  console.log("Processing Race:", race._id);
  return lockRace(getRaceId(race));
}

async function getProvisionalRaceRun(raceId, options) {
  return raceRunRepository.findOne({
    race_id: raceId,
    status: {
      $ne: 'cancelled'
    }
  }, options);
}

async function generateProvisionalRaceRun(raceId, userId, participantData) {
  const existingRaceRun = await getProvisionalRaceRun(raceId);

  if (existingRaceRun) {
    return {
      race_run: existingRaceRun,
      created: false
    };
  }

  const source = participantData || await collectParticipants(raceId);

  if (!source.participants.length) {
    throw new ApiError(400, "Race has no eligible participants");
  }

  const raceOrder = buildRaceOrder(raceId, source.participants);
  const payload = buildRaceRunPayload(raceId, userId, source.participants, raceOrder);

  try {
    const createdRaceRun = await raceRunRepository.create(payload);

    return {
      race_run: await getProvisionalRaceRun(createdRaceRun.race_id),
      created: true
    };
  } catch (error) {
    if (error && error.code === 11000) {
      return {
        race_run: await getProvisionalRaceRun(raceId),
        created: false
      };
    }

    throw error;
  }
}

async function cancelProvisionalRaceRun(raceRunId, options) {
  return raceRunRepository.updateById(raceRunId, { status: 'cancelled' }, options);
}

function buildOrderFromRaceRun(participants, raceRun) {
  if (!raceRun || !raceRun.finish_order || !raceRun.finish_order.length) {
    return [];
  }

  return raceRun.finish_order.reduce(function(items, orderItem) {
    const participant = participants.find(function(candidate) {
      return sameId(getObjectId(candidate.horse), getObjectId(orderItem.horse_id));
    });

    if (!participant) {
      return items;
    }

    items.push({
      participant: participant,
      horse_id: getObjectId(participant.horse),
      jockey_id: getObjectId(participant.jockey),
      assignment_id: getObjectId(participant.assignment),
      position: orderItem.position,
      finish_time: orderItem.finish_time,
      score: orderItem.score || getScore(orderItem.position)
    });

    return items;
  }, []).sort(function(first, second) {
    return first.position - second.position;
  });
}

module.exports = {
  createSeededRandom,
  ENGINE_RUN_STATUS,
  RUNNING_STALE_MS,
  addLatestHorseCheck,
  assertRegistrationOpen,
  calculateRegistrationLockAt,
  collectParticipantStatuses,
  collectParticipants,
  ensureRaceRegistrationIsUnlocked,
  findRacesReadyForLock,
  buildRaceOrder,
  generateDraftResults,
  generateProvisionalRaceRun,
  cancelProvisionalRaceRun,
  getFinishTime,
  getProvisionalRaceRun,
  getRunAction,
  isRunStale,
  lockRace,
  processDueRace,
  shuffle,
};
