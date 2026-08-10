require('dotenv').config();

const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const {
  Horse,
  Race,
  Registration,
  Round,
  Tournament,
  User
} = require('../models');

const APPLY = process.argv.includes('--apply');
const PARTICIPANTS_PER_RACE = 8;
const DEFAULT_PRIZE_CURRENCY = 'VND';

const tournamentBlueprints = [
  {
    name: 'Red River Championship 2026',
    description: 'A four-race championship card bringing regional stables together on Hanoi turf.',
    location: 'Hanoi Red River Racecourse',
    startDate: '2026-11-06T08:00:00.000Z'
  },
  {
    name: 'Central Heritage Cup 2026',
    description: 'A technical race weekend built around pace, positioning, and central-region form.',
    location: 'Hoi An Heritage Track',
    startDate: '2026-11-20T08:00:00.000Z'
  },
  {
    name: 'Southern Crown Series 2026',
    description: 'A competitive southern card featuring three heats and one championship final.',
    location: 'Saigon Southern Turf Club',
    startDate: '2026-12-04T08:00:00.000Z'
  },
  {
    name: 'Mountain Wind Classic 2026',
    description: 'An endurance-focused mountain meeting with changing pace and elevation conditions.',
    location: 'Sa Pa Mountain Racecourse',
    startDate: '2026-12-18T08:00:00.000Z'
  },
  {
    name: 'Golden Coast Trophy 2027',
    description: 'A coastal season opener pairing sprint heats with a measured 1,600-metre final.',
    location: 'Quy Nhon Golden Coast Track',
    startDate: '2027-01-08T08:00:00.000Z'
  }
];

function addHours(date, hours) {
  return new Date(date.getTime() + (hours * 60 * 60 * 1000));
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));
}

function getRacePrizePool(tournamentIndex, raceIndex) {
  const baseByRace = [50000000, 60000000, 70000000, 130000000];
  return baseByRace[raceIndex] + (tournamentIndex * 5000000);
}

async function buildPlan() {
  const admin = await User.findOne({ email: 'admin@racing.test' }).lean();
  const horses = await Horse.find({ status: 'active' }).sort({ registration_number: 1 }).lean();
  const existingRaces = await Race.find({}).lean();

  if (!admin) {
    throw new Error('The admin@racing.test account is required to create tournaments and approve registrations.');
  }

  if (horses.length < PARTICIPANTS_PER_RACE) {
    throw new Error(`At least ${PARTICIPANTS_PER_RACE} active horses are required; found ${horses.length}.`);
  }

  const registrations = await Registration.find({}).lean();
  const registrationsByRace = new Map();

  registrations.forEach(function(registration) {
    const key = String(registration.race_id);
    const items = registrationsByRace.get(key) || [];
    items.push(registration);
    registrationsByRace.set(key, items);
  });

  let missingApprovedSlots = 0;

  existingRaces.forEach(function(race) {
    const approvedHorseIds = new Set(
      (registrationsByRace.get(String(race._id)) || [])
        .filter(function(registration) { return registration.status === 'approved'; })
        .map(function(registration) { return String(registration.horse_id); })
    );

    if (approvedHorseIds.size > PARTICIPANTS_PER_RACE) {
      throw new Error(`Race ${race.name} already has ${approvedHorseIds.size} approved horses; refusing to remove participants automatically.`);
    }

    missingApprovedSlots += PARTICIPANTS_PER_RACE - approvedHorseIds.size;
  });

  return {
    admin,
    horses,
    existingRaces,
    newTournamentCount: tournamentBlueprints.length,
    newRaceCount: tournamentBlueprints.length * 4,
    missingApprovedSlots
  };
}

async function upsertTournamentCard(blueprint, adminId, tournamentIndex) {
  const startDate = new Date(blueprint.startDate);
  const endDate = addDays(startDate, 1);
  const tournament = await Tournament.findOneAndUpdate(
    { name: blueprint.name },
    {
      $setOnInsert: {
        description: blueprint.description,
        location: blueprint.location,
        start_date: startDate,
        end_date: endDate,
        status: 'scheduled',
        created_by: adminId
      }
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );

  const qualifier = await Round.findOneAndUpdate(
    { tournament_id: tournament._id, round_order: 1 },
    {
      $setOnInsert: {
        name: 'Qualifier',
        description: `${blueprint.name} qualifying heats.`,
        status: 'scheduled'
      }
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );

  const finalRound = await Round.findOneAndUpdate(
    { tournament_id: tournament._id, round_order: 2 },
    {
      $setOnInsert: {
        name: 'Final',
        description: `${blueprint.name} championship final.`,
        status: 'scheduled'
      }
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );

  const raceDefinitions = [
    { name: 'Heat 1', round: qualifier, date: addHours(startDate, 1), distance: 1200 },
    { name: 'Heat 2', round: qualifier, date: addHours(startDate, 4), distance: 1400 },
    { name: 'Heat 3', round: qualifier, date: addHours(startDate, 7), distance: 1600 },
    { name: 'Final', round: finalRound, date: addHours(endDate, 7), distance: 1600 }
  ];

  for (let raceIndex = 0; raceIndex < raceDefinitions.length; raceIndex += 1) {
    const definition = raceDefinitions[raceIndex];
    await Race.findOneAndUpdate(
      { tournament_id: tournament._id, name: `${blueprint.name.replace(/ 20\d{2}$/, '')} ${definition.name}` },
      {
        $set: {
          max_participants: PARTICIPANTS_PER_RACE,
          prize_pool: getRacePrizePool(tournamentIndex, raceIndex),
          prize_currency: DEFAULT_PRIZE_CURRENCY
        },
        $setOnInsert: {
          round_id: definition.round._id,
          race_date: definition.date,
          distance: definition.distance,
          location: blueprint.location,
          status: 'scheduled',
          betting_status: 'unavailable'
        }
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
  }
}

async function fillRaceRegistrations(admin, horses) {
  const races = await Race.find({}).sort({ race_date: 1, _id: 1 }).lean();
  let created = 0;

  for (let raceIndex = 0; raceIndex < races.length; raceIndex += 1) {
    const race = races[raceIndex];
    const raceRegistrations = await Registration.find({ race_id: race._id }).lean();
    const approvedHorseIds = new Set(
      raceRegistrations
        .filter(function(registration) { return registration.status === 'approved'; })
        .map(function(registration) { return String(registration.horse_id); })
    );
    const registeredHorseIds = new Set(
      raceRegistrations.map(function(registration) { return String(registration.horse_id); })
    );

    if (approvedHorseIds.size > PARTICIPANTS_PER_RACE) {
      throw new Error(`Race ${race.name} has more than ${PARTICIPANTS_PER_RACE} approved horses.`);
    }

    let cursor = raceIndex % horses.length;
    while (approvedHorseIds.size < PARTICIPANTS_PER_RACE) {
      let selectedHorse;

      for (let attempts = 0; attempts < horses.length; attempts += 1) {
        const candidate = horses[(cursor + attempts) % horses.length];
        if (!registeredHorseIds.has(String(candidate._id))) {
          selectedHorse = candidate;
          cursor = (cursor + attempts + 1) % horses.length;
          break;
        }
      }

      if (!selectedHorse) {
        throw new Error(`Could not find an unregistered horse for race ${race.name}.`);
      }

      const approvedAt = new Date();
      const raceDate = race.race_date ? new Date(race.race_date) : approvedAt;
      const registeredAt = raceDate > approvedAt ? addDays(raceDate, -14) : addDays(raceDate, -30);

      await Registration.create({
        tournament_id: race.tournament_id,
        race_id: race._id,
        horse_id: selectedHorse._id,
        owner_id: selectedHorse.owner_id,
        status: 'approved',
        note: 'Added by the eight-horse race data expansion.',
        admin_note: 'Automatically approved to complete the standard race field.',
        registered_at: registeredAt,
        approved_by: admin._id,
        approved_at: approvedAt
      });

      registeredHorseIds.add(String(selectedHorse._id));
      approvedHorseIds.add(String(selectedHorse._id));
      created += 1;
    }
  }

  return created;
}

async function verify() {
  const races = await Race.find({}).lean();
  const approvedCounts = await Registration.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: '$race_id', horses: { $addToSet: '$horse_id' } } },
    { $project: { count: { $size: '$horses' } } }
  ]);
  const countsByRace = new Map(approvedCounts.map(function(item) {
    return [String(item._id), item.count];
  }));
  const invalid = races.filter(function(race) {
    return race.max_participants !== PARTICIPANTS_PER_RACE || countsByRace.get(String(race._id)) !== PARTICIPANTS_PER_RACE;
  });

  return {
    tournaments: await Tournament.countDocuments(),
    races: races.length,
    approvedRegistrations: await Registration.countDocuments({ status: 'approved' }),
    invalidRaces: invalid.map(function(race) {
      return {
        name: race.name,
        maxParticipants: race.max_participants,
        approvedHorses: countsByRace.get(String(race._id)) || 0
      };
    })
  };
}

async function main() {
  await connectDatabase();
  const plan = await buildPlan();

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    currentRaces: plan.existingRaces.length,
    activeHorses: plan.horses.length,
    tournamentsToAdd: plan.newTournamentCount,
    racesToAdd: plan.newRaceCount,
    currentMissingApprovedSlots: plan.missingApprovedSlots
  }, null, 2));

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to write changes.');
    return;
  }

  for (let index = 0; index < tournamentBlueprints.length; index += 1) {
    await upsertTournamentCard(tournamentBlueprints[index], plan.admin._id, index);
  }

  const capacityUpdate = await Race.updateMany(
    { max_participants: { $ne: PARTICIPANTS_PER_RACE } },
    { $set: { max_participants: PARTICIPANTS_PER_RACE } }
  );
  const registrationsCreated = await fillRaceRegistrations(plan.admin, plan.horses);
  const result = await verify();

  console.log(JSON.stringify({
    capacityRecordsUpdated: capacityUpdate.modifiedCount,
    registrationsCreated,
    result
  }, null, 2));

  if (result.invalidRaces.length) {
    throw new Error(`${result.invalidRaces.length} races failed the eight-horse verification.`);
  }
}

main()
  .catch(function(error) {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async function() {
    await mongoose.disconnect();
  });
