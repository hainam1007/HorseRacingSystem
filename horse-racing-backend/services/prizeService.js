const ApiError = require('../utils/ApiError');
const { ROLE_NAMES } = require('../constants/roles');
const { PRIZE_AWARD_STATUS, RACE_RESULT_STATUS } = require('../constants/statuses');
const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');
const prizeRepository = require('../repositories/prizeRepository');
const profileRepository = require('../repositories/profileRepository');
const raceRepository = require('../repositories/raceRepository');

function getModels() { return loadSequelizeModels().models; }

const DEFAULT_DISTRIBUTION = [
  { position: 1, percent: 60, label: 'Winner' },
  { position: 2, percent: 20, label: 'Runner-up' },
  { position: 3, percent: 11, label: 'Third place' },
  { position: 4, percent: 6, label: 'Fourth place' },
  { position: 5, percent: 3, label: 'Fifth place' }
];

function hasRole(req, role) {
  return (req.roles || req.auth.roles || []).includes(role);
}

function getDocumentId(value) {
  return value && (value._id || value.id || value);
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return fallback;
  }

  return number;
}

function money(value) {
  return Math.round(Number(value || 0));
}

function normalizePrizeDistribution(distribution, prizePool) {
  const source = Array.isArray(distribution) && distribution.length
    ? distribution
    : prizePool > 0
      ? DEFAULT_DISTRIBUTION
      : [];
  const seenPositions = new Set();
  let totalPercent = 0;

  const normalized = source.map(function(item) {
    const position = toNumber(item.position, null);
    const percent = toNumber(item.percent, undefined);
    const amount = toNumber(item.amount, undefined);

    if (!Number.isInteger(position) || position < 1) {
      throw new ApiError(400, 'Prize position must be a positive integer');
    }

    if (seenPositions.has(position)) {
      throw new ApiError(400, 'Prize positions must be unique');
    }

    if (percent !== undefined && (percent < 0 || percent > 100)) {
      throw new ApiError(400, 'Prize percent must be between 0 and 100');
    }

    if (amount !== undefined && amount < 0) {
      throw new ApiError(400, 'Prize amount must be greater than or equal to 0');
    }

    if (percent === undefined && amount === undefined) {
      throw new ApiError(400, 'Each prize distribution item needs percent or amount');
    }

    seenPositions.add(position);
    totalPercent += Number(percent || 0);

    return {
      position: position,
      percent: percent,
      amount: amount,
      label: item.label || ('Position ' + position)
    };
  }).sort(function(first, second) {
    return first.position - second.position;
  });

  if (totalPercent > 100) {
    throw new ApiError(400, 'Total prize percent cannot exceed 100');
  }

  return normalized;
}

function resolvePrizeAmount(item, prizePool) {
  if (item.amount !== undefined && item.amount !== null) {
    return money(item.amount);
  }

  return money(Number(prizePool || 0) * Number(item.percent || 0) / 100);
}

function splitPrizeAmount(amount) {
  const gross = money(amount);
  const ownerAmount = money(gross * 0.9);

  return {
    gross_amount: gross,
    owner_amount: ownerAmount,
    jockey_amount: gross - ownerAmount
  };
}

async function syncPrizeDocuments(race, distribution, session) {
  const prizes = [];

  for (const item of distribution) {
    const amount = resolvePrizeAmount(item, race.prize_pool);
    const prize = await prizeRepository.upsertPrize(
      { race_id: race._id, position: item.position },
      {
        tournament_id: getDocumentId(race.tournament_id),
        race_id: race._id,
        prize_name: item.label || ('Position ' + item.position),
        position: item.position,
        amount: amount,
        percent: item.percent || 0,
        currency: race.prize_currency || 'VND',
        description: item.label
      },
      session
    );

    prizes.push(prize);
  }

  return prizes;
}

async function configureRacePrizes(adminUserId, raceId, payload) {
  const prizePool = toNumber(payload.prize_pool !== undefined ? payload.prize_pool : payload.prizePool, 0);

  if (prizePool < 0) {
    throw new ApiError(400, 'prize_pool must be greater than or equal to 0');
  }

  const distribution = normalizePrizeDistribution(payload.prize_distribution || payload.distribution, prizePool);
  const update = {
    prize_pool: prizePool,
    prize_currency: (payload.prize_currency || payload.currency || 'VND').toUpperCase(),
    prize_distribution: distribution
  };
  const [affected] = await getModels().Race.update(update, { where: { id: raceId } });
  if (affected === 0) {
    throw new ApiError(404, 'Race not found');
  }
  const race = await getModels().Race.findByPk(raceId);
  const racePlain = race && (race.toJSON ? race.toJSON() : race);
  const raceView = { ...racePlain, _id: raceId };

  const prizes = await syncPrizeDocuments(raceView, distribution);

  return {
    race: await raceRepository.findById(raceId),
    prizes: prizes,
    configured_by: adminUserId
  };
}

async function getRacePrizeConfig(raceId) {
  const race = await raceRepository.findById(raceId);

  if (!race) {
    throw new ApiError(404, 'Race not found');
  }

  return {
    race: race,
    prizes: await prizeRepository.findPrizes({ race_id: race._id })
  };
}

async function ensurePrizeForDistribution(race, item, session) {
  const existing = await prizeRepository.findPrize({
    race_id: race._id,
    position: item.position
  }, session);

  if (existing) {
    return existing;
  }

  const prizes = await syncPrizeDocuments(race, [item], session);

  return prizes[0];
}

async function calculateRacePrizeAwards(raceId, adminUserId, _options) {
  const race = await getModels().Race.findByPk(raceId);
  if (!race) {
    throw new ApiError(404, 'Race not found');
  }
  const racePlain = race.toJSON ? race.toJSON() : race;
  const raceView = { ...racePlain, _id: raceId };

  const results = await getModels().RaceResult.findAll({
    where: { race_id: raceId, status: RACE_RESULT_STATUS.PUBLISHED },
    include: [
      {
        model: getModels().Horse,
        as: 'horse',
        include: [{ model: getModels().HorseOwner, as: 'owner' }]
      },
      { model: getModels().Jockey, as: 'jockey' }
    ],
    order: [['final_position', 'ASC'], ['position', 'ASC']]
  });

  const distribution = normalizePrizeDistribution(raceView.prize_distribution, Number(raceView.prize_pool || 0));

  if (!distribution.length) {
    return {
      race_id: raceId,
      awards: [],
      created_count: 0,
      skipped: 'Race has no prize distribution'
    };
  }

  const createdAwards = [];
  let createdCount = 0;

  for (const result of results) {
    const position = Number(result.final_position || result.position || 0);
    const distributionItem = distribution.find(function(item) {
      return item.position === position;
    });

    if (!position || !distributionItem) continue;

    const resultPlain = result.toJSON ? result.toJSON() : result;
    const resultId = resultPlain._id || result.id;

    const existing = await prizeRepository.findAward({ race_result_id: resultId });
    if (existing) {
      createdAwards.push(existing);
      continue;
    }

    const horse = result.horse;
    const ownerId = horse && getDocumentId(horse.owner_id);
    const jockeyId = getDocumentId(result.jockey);

    if (!horse || !ownerId) {
      throw new ApiError(400, 'Race result horse owner is required for prize award');
    }

    const prize = await ensurePrizeForDistribution(raceView, distributionItem);
    const split = splitPrizeAmount(prize.amount);
    const now = new Date();
    const award = await prizeRepository.createAward({
      prize_id: getDocumentId(prize),
      race_result_id: resultId,
      horse_id: getDocumentId(horse),
      owner_id: ownerId,
      jockey_id: jockeyId,
      position: position,
      amount: split.gross_amount,
      gross_amount: split.gross_amount,
      owner_amount: split.owner_amount,
      jockey_amount: split.jockey_amount,
      currency: prize.currency || raceView.prize_currency || 'VND',
      status: PRIZE_AWARD_STATUS.CALCULATED,
      awarded_at: now,
      calculated_at: now
    });

    createdAwards.push(award);
    createdCount += 1;
  }

  return {
    race_id: raceId,
    awards: createdAwards,
    created_count: createdCount,
    calculated_by: adminUserId
  };
}

async function approveRaceAwards(adminUserId, raceId) {
  let awards = await listRaceAwards(null, raceId);

  if (!awards.length) {
    await calculateRacePrizeAwards(raceId, adminUserId);
    awards = await listRaceAwards(null, raceId);
  }

  const prizes = await prizeRepository.findPrizes({ race_id: raceId });

  await prizeRepository.updateAwards(
    {
      prize_id: {
        $in: prizes.map(function(prize) {
          return getDocumentId(prize);
        })
      },
      status: PRIZE_AWARD_STATUS.CALCULATED
    },
    {
      status: PRIZE_AWARD_STATUS.APPROVED,
      approved_by: adminUserId,
      approved_at: new Date()
    }
  );

  return {
    race_id: raceId,
    awards: await listRaceAwards(null, raceId)
  };
}

async function markAwardPaid(adminUserId, awardId) {
  const award = await prizeRepository.findAwardById(awardId);

  if (!award) {
    throw new ApiError(404, 'Prize award not found');
  }

  if (![PRIZE_AWARD_STATUS.CALCULATED, PRIZE_AWARD_STATUS.APPROVED].includes(award.status)) {
    throw new ApiError(400, 'Only calculated or approved awards can be marked paid');
  }

  return {
    award: await prizeRepository.updateAwardById(awardId, {
      status: PRIZE_AWARD_STATUS.PAID,
      paid_by: adminUserId,
      paid_at: new Date()
    })
  };
}

async function listRaceAwards(req, raceId) {
  const prizes = await prizeRepository.findPrizes({ race_id: raceId });
  const prizeIds = prizes.map(function(prize) {
    return getDocumentId(prize);
  });

  if (!prizeIds.length) {
    return [];
  }

  const filter = { prize_id: { $in: prizeIds } };

  if (req && hasRole(req, ROLE_NAMES.HORSE_OWNER) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (!owner) {
      throw new ApiError(404, 'Horse owner profile not found');
    }

    filter.owner_id = owner._id;
  }

  if (req && hasRole(req, ROLE_NAMES.JOCKEY) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const jockey = await profileRepository.findJockeyByUserId(req.user._id);

    if (!jockey) {
      throw new ApiError(404, 'Jockey profile not found');
    }

    filter.jockey_id = jockey._id;
  }

  return prizeRepository.findAwards(filter);
}

async function listAwards(req, query) {
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.race_id) {
    return {
      awards: await listRaceAwards(req, query.race_id)
    };
  }

  if (hasRole(req, ROLE_NAMES.HORSE_OWNER) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const owner = await profileRepository.findHorseOwnerByUserId(req.user._id);

    if (!owner) {
      throw new ApiError(404, 'Horse owner profile not found');
    }

    filter.owner_id = owner._id;
  }

  if (hasRole(req, ROLE_NAMES.JOCKEY) && !hasRole(req, ROLE_NAMES.ADMIN)) {
    const jockey = await profileRepository.findJockeyByUserId(req.user._id);

    if (!jockey) {
      throw new ApiError(404, 'Jockey profile not found');
    }

    filter.jockey_id = jockey._id;
  }

  return {
    awards: await prizeRepository.findAwards(filter)
  };
}

module.exports = {
  approveRaceAwards,
  calculateRacePrizeAwards,
  configureRacePrizes,
  getRacePrizeConfig,
  listAwards,
  listRaceAwards,
  markAwardPaid,
  normalizePrizeDistribution,
  splitPrizeAmount
};
