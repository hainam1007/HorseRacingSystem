const ApiError = require('../utils/ApiError');
const tournamentRepository = require('../repositories/tournamentRepository');
const raceRepository = require('../repositories/raceRepository');
const cloudinaryService = require('./cloudinaryService');

function plain(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function summarizeTournament(tournament, races) {
  const totalsByCurrency = (races || []).reduce(function(totals, race) {
    const currency = String(race.prize_currency || 'VND').toUpperCase();
    totals[currency] = (totals[currency] || 0) + Number(race.prize_pool || 0);
    return totals;
  }, {});

  return Object.assign({}, plain(tournament), {
    race_count: (races || []).length,
    total_race_prize_pool: Object.values(totalsByCurrency).reduce(function(total, amount) {
      return total + amount;
    }, 0),
    prize_totals_by_currency: totalsByCurrency
  });
}

async function enrichTournamentSummaries(tournaments) {
  const list = Array.isArray(tournaments) ? tournaments : [tournaments];
  const ids = list.map(function(tournament) {
    return tournament && tournament._id;
  }).filter(Boolean);

  if (!ids.length) {
    const summaries = list.map(function(tournament) {
      return summarizeTournament(tournament, []);
    });
    return Array.isArray(tournaments) ? summaries : summaries[0];
  }

  const races = await raceRepository.findByTournamentIds(ids);
  const racesByTournament = races.reduce(function(map, race) {
    const tournamentId = race.tournament_id.toString();

    if (!map.has(tournamentId)) {
      map.set(tournamentId, []);
    }

    map.get(tournamentId).push(race);
    return map;
  }, new Map());
  const enriched = list.map(function(tournament) {
    if (!tournament || !tournament._id) {
      return summarizeTournament(tournament, []);
    }

    return summarizeTournament(
      tournament,
      racesByTournament.get(tournament._id.toString()) || []
    );
  });

  return Array.isArray(tournaments) ? enriched : enriched[0];
}

async function prepareTournamentPayload(payload) {
  const data = Object.assign({}, payload || {});
  const imageFileData = data.image_file_data;

  delete data.entry_fee;
  delete data.entry_fee_currency;
  delete data.image_file_data;
  delete data.image_file_name;
  delete data.image_preview;

  if (imageFileData === undefined || imageFileData === '') {
    return data;
  }

  if (typeof imageFileData !== 'string' || !imageFileData.startsWith('data:image/')) {
    throw new ApiError(400, 'Tournament image must be an image file');
  }

  const upload = await cloudinaryService.uploadAsset(imageFileData, {
    folder: 'horse-racing/tournaments',
    resource_type: 'image'
  });

  data.image_url = upload.secure_url;
  data.image_public_id = upload.public_id || undefined;
  return data;
}

async function createTournament(userId, payload) {
  const tournamentPayload = await prepareTournamentPayload(payload);
  const tournament = await tournamentRepository.create(Object.assign({}, tournamentPayload, { created_by: userId }));

  return {
    tournament: await enrichTournamentSummaries(tournament)
  };
}

async function listTournaments(query) {
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  return {
    tournaments: await enrichTournamentSummaries(await tournamentRepository.find(filter))
  };
}

async function getTournament(id) {
  const tournament = await tournamentRepository.findById(id);

  if (!tournament) {
    throw new ApiError(404, 'Tournament not found');
  }

  return {
    tournament: await enrichTournamentSummaries(tournament)
  };
}

async function updateTournament(id, payload) {
  const tournamentPayload = await prepareTournamentPayload(payload);
  const tournament = await tournamentRepository.updateById(id, tournamentPayload);

  if (!tournament) {
    throw new ApiError(404, 'Tournament not found');
  }

  return {
    tournament: await enrichTournamentSummaries(tournament)
  };
}

async function deleteTournament(id) {
  const tournament = await tournamentRepository.softDeleteById(id);

  if (!tournament) {
    throw new ApiError(404, 'Tournament not found');
  }

  return {
    tournament: tournament
  };
}

module.exports = {
  createTournament,
  listTournaments,
  getTournament,
  updateTournament,
  deleteTournament
};
