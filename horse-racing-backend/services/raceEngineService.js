const crypto = require("crypto");

const ApiError = require("../utils/ApiError");
const {
  ASSIGNMENT_STATUS,
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  RACE_RESULT_STATUS,
  REGISTRATION_STATUS,
} = require("../constants/statuses");
const { loadSequelizeModels } = require("../models/sequelize/index.js");
const raceEngineRunRepository = require("../repositories/raceEngineRunRepository");
const raceOddsMarketRepository = require("../repositories/raceOddsMarketRepository");
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
const THREE_SECTION_RACE = Object.freeze({
  TRACK_LENGTH: 1000,
  BASE_FINISH_SECONDS: 60,
  SECTION_DISTANCES: [350, 350, 300],
  VERSION: 1,
});

function getModels() {
  return loadSequelizeModels().models;
}

function getSequelize() {
  return loadSequelizeModels().sequelize;
}

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

function getDocumentId(value) {
  return value && (value._id || value.id || value);
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

function getHorseProbability(oddsByHorse, horseId, fallbackProbability) {
  const value = Number(oddsByHorse.get(String(horseId)));
  return Number.isFinite(value) && value >= 0 ? value : fallbackProbability;
}

function buildThreeSectionPerformance(raceId, participants, odds, options = {}) {
  const participantCount = Math.max(1, participants.length);
  const fallbackProbability = 1 / participantCount;
  const oddsByHorse = new Map((odds || []).map(function(item) {
    return [String(getDocumentId(item.horse_id)), Number(item.win_probability)];
  }));
  const probabilities = participants.map(function(participant) {
    return getHorseProbability(
      oddsByHorse,
      getDocumentId(participant.horse),
      fallbackProbability,
    );
  });
  const minimumProbability = Math.min(...probabilities);
  const maximumProbability = Math.max(...probabilities);
  const probabilityRange = maximumProbability - minimumProbability;
  const seed = options.seed || (process.env.RACE_ENGINE_RANDOM_SEED
    ? process.env.RACE_ENGINE_RANDOM_SEED + ':' + raceId
    : null);
  const baseSpeed = THREE_SECTION_RACE.TRACK_LENGTH / THREE_SECTION_RACE.BASE_FINISH_SECONDS;

  return participants.map(function(participant, index) {
    const horseId = getDocumentId(participant.horse);
    const winProbability = probabilities[index];
    const normalizedProbability = probabilityRange > 0
      ? (winProbability - minimumProbability) / probabilityRange
      : 0.5;
    const sectionRandom = seed
      ? createSeededRandom(seed + ':section-2:' + horseId)()
      : Math.random();

    // Section 1 rewards model probability, section 2 is seeded random,
    // and section 3 blends 50% fixed pace with 50% probability pace.
    const speedMultipliers = [
      0.9 + 0.2 * normalizedProbability,
      0.8 + 0.4 * sectionRandom,
      0.5 + 0.5 * (0.8 + 0.4 * normalizedProbability),
    ];
    const sectionTimes = THREE_SECTION_RACE.SECTION_DISTANCES.map(function(distance, sectionIndex) {
      return distance / (baseSpeed * speedMultipliers[sectionIndex]);
    });
    const finishTime = sectionTimes.reduce(function(total, time) { return total + time; }, 0);

    return {
      participant: participant,
      horse_id: horseId,
      jockey_id: getDocumentId(participant.jockey),
      assignment_id: getDocumentId(participant.assignment),
      win_probability: Number(winProbability.toFixed(5)),
      normalized_probability: Number(normalizedProbability.toFixed(5)),
      section_speed_multipliers: speedMultipliers.map(function(value) { return Number(value.toFixed(5)); }),
      section_times: sectionTimes.map(function(value) { return Number(value.toFixed(3)); }),
      finish_time: Number(finishTime.toFixed(3)),
    };
  });
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

async function getRaceOrThrow(raceId) {
  const race = await raceRepository.findById(raceId);

  if (!race) {
    throw new ApiError(404, "Race not found");
  }

  return race;
}

async function lockRace(raceId) {
  // Sequelize managed transaction (replaces the legacy session.withTransaction).
  const sequelize = getSequelize();
  let response;

  await sequelize.transaction(async () => {
    const race = await raceRepository.findById(raceId);

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

    await raceRepository.updateById(raceId, {
      $set: {
        registration_locked: true,
        registration_lock_at: registrationLockAt
      }
    });

    const updated = await raceRepository.findById(raceId);

    response = {
      race: updated,
      locked: true,
    };
  });

  return response;
}

async function collectParticipantStatuses(raceId, _options) {
  // Note: `_options.session` was a per-query legacy session parameter; Sequelize handles
  // transactions at the unit-of-work boundary, so we accept and ignore it.
  const models = getModels();
  const { Op } = require('sequelize');
  const { Registration, JockeyAssignment, HorseCheck, Horse, HorseOwner, User, Jockey } = models;

  const race = await getRaceOrThrow(raceId);

  const registrations = await Registration.findAll({
    where: {
      race_id: raceId,
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
            include: [{ model: User, as: 'user' }]
          }
        ]
      }
    ],
    order: [['created_at', 'ASC']]
  });

  const horseIds = registrations
    .map((registration) => registration.horse_id)
    .filter(Boolean);

  if (!horseIds.length) {
    return {
      race: race,
      participants: [],
    };
  }

  const assignments = await JockeyAssignment.findAll({
    where: {
      race_id: raceId,
      horse_id: { [Op.in]: horseIds },
      assignment_type: 'primary',
      status: ASSIGNMENT_STATUS.ACCEPTED
    },
    order: [['invited_at', 'DESC']],
    include: [
      {
        model: Jockey,
        as: 'jockey',
        include: [{ model: User, as: 'user' }]
      }
    ]
  });

  const horseChecks = await HorseCheck.findAll({
    where: {
      race_id: raceId,
      horse_id: { [Op.in]: horseIds }
    },
    order: [['checked_at', 'DESC']]
  });

  const assignmentByHorse = new Map();
  const latestPreCheckByHorse = new Map();
  const latestPostCheckByHorse = new Map();

  assignments.forEach((assignment) => {
    const horseId = assignment.horse_id && assignment.horse_id.toString();
    if (!assignmentByHorse.has(horseId)) {
      assignmentByHorse.set(horseId, assignment);
    }
  });

  horseChecks.forEach((horseCheck) => {
    if (horseCheck.phase === HORSE_CHECK_PHASE.PRE_RACE) {
      addLatestHorseCheck(latestPreCheckByHorse, horseCheck);
    }
    if (horseCheck.phase === HORSE_CHECK_PHASE.POST_RACE) {
      addLatestHorseCheck(latestPostCheckByHorse, horseCheck);
    }
  });

  const participants = registrations.map((registration) => {
    const horse = registration.horse;
    const horseId = horse && (horse._id || horse.id || horse);
    const assignment = horseId ? assignmentByHorse.get(horseId.toString()) : null;
    const preRaceCheck = horseId ? latestPreCheckByHorse.get(horseId.toString()) : null;
    const postRaceCheck = horseId ? latestPostCheckByHorse.get(horseId.toString()) : null;
    const blockers = [];

    if (!assignment || assignment.status !== ASSIGNMENT_STATUS.ACCEPTED) {
      blockers.push("accepted_jockey_assignment_required");
    }

    if (
      assignment &&
      assignment.jockey &&
      assignment.jockey.suspended_until &&
      new Date(assignment.jockey.suspended_until).getTime() > Date.now()
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
      jockey: assignment ? assignment.jockey : null,
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

function buildRaceOrder(raceId, participants, odds, options = {}) {
  return buildThreeSectionPerformance(raceId, participants, odds, options)
    .sort(function(first, second) {
      return first.finish_time - second.finish_time || String(first.horse_id).localeCompare(String(second.horse_id));
    })
    .map(function(item, index) {
      return {
        ...item,
        position: index + 1,
        score: getScore(index + 1),
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

function buildRaceRunPayload(raceId, userId, participants, raceOrder, seed) {
  return {
    race_id: raceId,
    status: 'generated',
    generated_by: userId,
    generated_at: new Date(),
    seed: seed,
    participants: participants.map(function(participant, index) {
      return {
        horse_id: getDocumentId(participant.horse),
        jockey_id: getDocumentId(participant.jockey),
        assignment_id: getDocumentId(participant.assignment),
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

async function collectParticipants(raceId, _options) {
  const participantData = await collectParticipantStatuses(raceId, _options);
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
  return raceEngineRunRepository.updateById(getDocumentId(run), {
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

async function startRun(raceId, existingRun, _session) {
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
    return raceEngineRunRepository.updateById(getDocumentId(existingRun), runData);
  }

  try {
    return await raceEngineRunRepository.create(runData);
  } catch (error) {
    // Sequelize unique-constraint error code
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.code === '23505')) {
      const concurrentRun = await raceEngineRunRepository.findOne({ race_id: raceId });

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

async function completeRun(run, _session) {
  return raceEngineRunRepository.updateById(
    getDocumentId(run),
    {
      status: ENGINE_RUN_STATUS.COMPLETED,
      completed_at: new Date(),
      error: undefined,
    }
  );
}

async function failRun(run, error) {
  return raceEngineRunRepository.updateById(getDocumentId(run), {
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

  const sequelize = getSequelize();
  let activeRun;

  try {
    activeRun = await startRun(raceId, runState.run);

    let response;

    await sequelize.transaction(async () => {
      const models = getModels();
      const { RaceResult, Race } = models;

      const race = await raceRepository.findById(raceId);

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

      const existingResultCount = await RaceResult.count({ where: { race_id: raceId } });

      if (existingResultCount > 0) {
        await raceRepository.updateById(raceId, {
          $set: {
            registration_locked: true,
            registration_lock_at: registrationLockAt
          }
        });

        const completedRun = await completeRun(activeRun);

        response = {
          skipped: true,
          reason: "Race results already exist",
          run: completedRun,
          results: [],
        };
        return;
      }

      const participantData = await collectParticipants(raceId);

      if (!participantData.participants.length) {
        throw new ApiError(400, "Race has no eligible participants");
      }

      const raceRun = await getProvisionalRaceRun(raceId);
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
          status: RACE_RESULT_STATUS.DRAFT,
          recorded_by: race.referee_id && (race.referee_id._id || race.referee_id),
          recorded_at: new Date(),
        };
      });

      if (results.length) {
        await RaceResult.bulkCreate(results);
      }

      if (raceRun && getDocumentId(raceRun)) {
        await raceRunRepository.updateById(
          getDocumentId(raceRun),
          { status: 'used' }
        );
      }

      await raceRepository.updateById(raceId, {
        $set: {
          registration_locked: true,
          registration_lock_at: registrationLockAt
        }
      });

      const completedRun = await completeRun(activeRun);

      response = {
        skipped: false,
        run: completedRun,
        results: results,
      };
    });

    return response;
  } catch (error) {
    if (activeRun && getDocumentId(activeRun)) {
      await failRun(activeRun, error);
    }

    throw error;
  }
}

async function ensureRaceRegistrationIsUnlocked(raceId) {
  const race = await getRaceOrThrow(raceId);
  assertRegistrationOpen(race);
  return race;
}

async function findRacesReadyForLock(now) {
  const models = getModels();
  const { Op } = require('sequelize');
  const { Race } = models;
  const currentTime = now || new Date();
  const raceDateCutoff = new Date(currentTime.getTime() + LOCK_OFFSET_MS);

  // Sequelize equivalent of the legacy `$or` with `$lte`/`$exists`:
  // - registration_lock_at <= currentTime
  // - OR (registration_lock_at IS NULL AND race_date <= raceDateCutoff)
  const rows = await Race.findAll({
    where: {
      registration_locked: false,
      [Op.or]: [
        { registration_lock_at: { [Op.lte]: currentTime } },
        {
          [Op.and]: [
            { registration_lock_at: null },
            { race_date: { [Op.lte]: raceDateCutoff } }
          ]
        }
      ]
    }
  });

  return rows.map(r => r.toJSON ? r.toJSON() : r);
}

async function processDueRace(race) {
  console.log("Processing Race:", race._id);
  return lockRace(getRaceId(race));
}

async function getProvisionalRaceRun(raceId, _options) {
  const { Op } = require('sequelize');
  return raceRunRepository.findOne({
    race_id: raceId,
    status: { [Op.ne]: 'cancelled' }
  });
}

async function generateProvisionalRaceRun(raceId, userId, participantData) {
  const existingRaceRun = await getProvisionalRaceRun(raceId);

  if (existingRaceRun && existingRaceRun.participants?.length && existingRaceRun.finish_order?.length) {
    return {
      race_run: existingRaceRun,
      created: false
    };
  }

  const source = participantData || await collectParticipants(raceId);

  if (!source.participants.length) {
    throw new ApiError(400, "Race has no eligible participants");
  }

  const market = await raceOddsMarketRepository.findByRaceId(raceId);
  const seed = process.env.RACE_ENGINE_RANDOM_SEED
    ? process.env.RACE_ENGINE_RANDOM_SEED + ':' + raceId
    : crypto.randomUUID();
  const raceOrder = buildRaceOrder(raceId, source.participants, market?.odds || [], { seed: seed });
  const payload = buildRaceRunPayload(raceId, userId, source.participants, raceOrder, seed);

  try {
    if (existingRaceRun) {
      return {
        race_run: await raceRunRepository.populateDetails(getDocumentId(existingRaceRun), payload),
        created: false,
        repaired: true,
      };
    }

    const createdRaceRun = await raceRunRepository.create(payload);

    return {
      race_run: await getProvisionalRaceRun(createdRaceRun.race_id),
      created: true
    };
  } catch (error) {
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.code === '23505')) {
      return {
        race_run: await getProvisionalRaceRun(raceId),
        created: false
      };
    }

    throw error;
  }
}

function buildRaceScriptFromRun(raceRun, odds) {
  if (!raceRun || !Array.isArray(raceRun.participants) || !raceRun.participants.length) {
    return null;
  }

  const raceId = getDocumentId(raceRun.race_id);
  const participants = raceRun.participants.map(function(item) {
    return {
      horse: item.horse || item.horse_id,
      jockey: item.jockey || item.jockey_id,
      assignment: item.assignment || item.assignment_id,
      registration: { lane: item.lane },
    };
  });
  const performance = buildThreeSectionPerformance(raceId, participants, odds, {
    seed: raceRun.seed || String(raceId),
  });
  const persistedFinishByHorse = new Map((raceRun.finish_order || []).map(function(item) {
    return [String(getDocumentId(item.horse || item.horse_id)), Number(item.finish_time)];
  }));
  let maximumFinishMs = 0;

  const horses = performance.map(function(item, index) {
    const participant = raceRun.participants[index];
    const persistedFinish = persistedFinishByHorse.get(String(item.horse_id));
    const targetFinishSeconds = Number.isFinite(persistedFinish) && persistedFinish > 0
      ? persistedFinish
      : item.finish_time;
    const scale = targetFinishSeconds / item.finish_time;
    let cumulativeSeconds = 0;
    const distances = [0];
    THREE_SECTION_RACE.SECTION_DISTANCES.reduce(function(total, distance) {
      const next = total + distance;
      distances.push(next);
      return next;
    }, 0);
    const checkpoints = [{ time_ms: 0, distance: 0 }];

    item.section_times.forEach(function(sectionTime, sectionIndex) {
      cumulativeSeconds += sectionTime * scale;
      checkpoints.push({
        time_ms: Math.round(cumulativeSeconds * 1000),
        distance: distances[sectionIndex + 1],
      });
    });
    maximumFinishMs = Math.max(maximumFinishMs, checkpoints[checkpoints.length - 1].time_ms);

    const horse = participant.horse || participant.horse_id || {};
    return {
      horse_id: String(item.horse_id),
      name: horse.name || String(item.horse_id),
      lane: Number(participant.lane) || index + 1,
      win_probability: item.win_probability,
      section_speed_multipliers: item.section_speed_multipliers,
      checkpoints: checkpoints,
    };
  });

  return {
    race_id: String(raceId),
    script_version: THREE_SECTION_RACE.VERSION,
    issued_at: new Date(raceRun.generated_at || Date.now()).toISOString(),
    starts_at: new Date(raceRun.generated_at || Date.now()).toISOString(),
    duration_ms: maximumFinishMs + 1000,
    track_length: THREE_SECTION_RACE.TRACK_LENGTH,
    horses: horses,
    source: 'three_section_probability_v1',
  };
}

async function cancelProvisionalRaceRun(raceRunId, _options) {
  return raceRunRepository.updateById(raceRunId, { status: 'cancelled' });
}

function buildOrderFromRaceRun(participants, raceRun) {
  if (!raceRun || !raceRun.finish_order || !raceRun.finish_order.length) {
    return [];
  }

  return raceRun.finish_order.reduce(function(items, orderItem) {
    const participant = participants.find(function(candidate) {
      return sameId(getDocumentId(candidate.horse), getDocumentId(orderItem.horse_id));
    });

    if (!participant) {
      return items;
    }

    items.push({
      participant: participant,
      horse_id: getDocumentId(participant.horse),
      jockey_id: getDocumentId(participant.jockey),
      assignment_id: getDocumentId(participant.assignment),
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
  buildRaceScriptFromRun,
  buildRaceOrder,
  buildThreeSectionPerformance,
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
