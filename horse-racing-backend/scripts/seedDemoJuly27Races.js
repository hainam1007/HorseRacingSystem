require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const {
  Horse,
  HorseCheck,
  HorseOwner,
  Jockey,
  JockeyAssignment,
  Race,
  RaceResult,
  RaceRun,
  RaceReferee,
  Registration,
  Role,
  Round,
  Tournament,
  User,
  UserRole
} = require('../models');
const {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_TYPE,
  REGISTRATION_STATUS
} = require('../constants/statuses');
const { ROLE_NAMES } = require('../constants/roles');

const TOURNAMENT_NAME = 'Demo 27/07/2026 - Spectator Result Test';
const RACE_COUNT = 5;
const PARTICIPANTS_PER_RACE = 6;
const ENTRY_FEE_VND = 500000;
const LOCATION = 'Saigon Riverside Racecourse';
const RACE_TIMES = ['10:00', '11:30', '13:00', '14:30', '16:00'];
const RACE_DISTANCES = [1200, 1400, 1600, 1800, 2000];

function raceDateAt(time) {
  return new Date(`2026-07-27T${time}:00+07:00`);
}

function getDocumentId(value) {
  return value && (value._id || value);
}

async function findAdminUser() {
  const role = await Role.findOne({ role_name: ROLE_NAMES.ADMIN }).select('_id').lean();
  const userRole = role
    ? await UserRole.findOne({ role_id: role._id }).select('user_id').lean()
    : null;

  return userRole
    ? User.findById(userRole.user_id).select('_id full_name email').lean()
    : User.findOne({ status: 'active' }).select('_id full_name email').lean();
}

async function findDemoReferee() {
  const user = await User.findOne({ email: 'referee1@racing.test' })
    .select('_id full_name email')
    .lean();

  if (!user) {
    return null;
  }

  return RaceReferee.findOne({ user_id: user._id, status: 'active' })
    .populate('user_id', 'full_name email');
}

async function loadSeedPool() {
  const [admin, horses, jockeys, demoReferee] = await Promise.all([
    findAdminUser(),
    Horse.find({ status: 'active' })
      .populate({ path: 'owner_id', match: { status: 'active' } })
      .sort({ created_at: 1 }),
    Jockey.find({ status: 'active' })
      .populate('user_id', 'full_name email')
      .sort({ total_wins: -1, experience_years: -1 }),
    findDemoReferee()
  ]);
  const eligibleHorses = horses.filter(function(horse) {
    return Boolean(horse.owner_id && getDocumentId(horse.owner_id));
  });

  if (!admin) {
    throw new Error('An admin or active user is required to create the demo tournament.');
  }

  if (eligibleHorses.length < PARTICIPANTS_PER_RACE) {
    throw new Error(`Need at least ${PARTICIPANTS_PER_RACE} active horses with active owners; found ${eligibleHorses.length}.`);
  }

  if (jockeys.length < PARTICIPANTS_PER_RACE) {
    throw new Error(`Need at least ${PARTICIPANTS_PER_RACE} active jockeys; found ${jockeys.length}.`);
  }

  if (!demoReferee) {
    throw new Error('referee1@racing.test must have an active race referee profile.');
  }

  return {
    admin,
    horses: eligibleHorses.slice(0, PARTICIPANTS_PER_RACE),
    jockeys: jockeys.slice(0, PARTICIPANTS_PER_RACE),
    referee: demoReferee
  };
}

async function summarizeTournament(tournament) {
  const races = await Race.find({ tournament_id: tournament._id })
    .populate({
      path: 'referee_id',
      populate: { path: 'user_id', select: 'full_name email' }
    })
    .sort({ race_no: 1 })
    .lean();
  const raceIds = races.map(function(race) {
    return race._id;
  });
  const countByRace = async function(Model) {
    const counts = await Model.aggregate([
      { $match: { race_id: { $in: raceIds } } },
      { $group: { _id: '$race_id', count: { $sum: 1 } } }
    ]);

    return new Map(counts.map(function(item) {
      return [item._id.toString(), item.count];
    }));
  };
  const [registrations, assignments, checks, runs, results] = await Promise.all([
    countByRace(Registration),
    countByRace(JockeyAssignment),
    countByRace(HorseCheck),
    countByRace(RaceRun),
    countByRace(RaceResult)
  ]);

  return {
    reused: true,
    tournament: {
      id: tournament._id.toString(),
      name: tournament.name
    },
    races: races.map(function(race) {
      return {
        id: race._id.toString(),
        name: race.name,
        race_date: race.race_date,
        status: race.status,
        referee: race.referee_id && race.referee_id.user_id
          ? race.referee_id.user_id.email
          : null,
        participants: registrations.get(race._id.toString()) || 0,
        assignments: assignments.get(race._id.toString()) || 0,
        pre_checks: checks.get(race._id.toString()) || 0,
        race_runs: runs.get(race._id.toString()) || 0,
        results: results.get(race._id.toString()) || 0
      };
    })
  };
}

function buildAssignment(race, horse, jockey, adminUserId, participantIndex) {
  const now = new Date();
  const horseIdSuffix = horse._id.toString().slice(-6).toUpperCase();

  return {
    race_id: race._id,
    horse_id: horse._id,
    owner_id: getDocumentId(horse.owner_id),
    jockey_id: jockey._id,
    assignment_type: ASSIGNMENT_TYPE.PRIMARY,
    status: ASSIGNMENT_STATUS.ACCEPTED,
    invitation_message: `Primary jockey invitation for ${race.name}.`,
    meeting: {
      title: `${horse.name} race-day briefing`,
      meeting_time: new Date(race.race_date.getTime() - 24 * 60 * 60 * 1000),
      location_name: LOCATION,
      address: LOCATION,
      contact_name: 'Demo Race Office',
      contact_phone: '+84 900 270 726',
      note: 'Offline briefing completed for the spectator result test.',
      accepted_at: new Date(now.getTime() - 48 * 60 * 60 * 1000)
    },
    terms: {
      agreed_terms: 'Standard safety, conduct, race-day fee, and participation terms.',
      meeting_note: 'Both parties accepted the primary jockey terms.',
      agreed_at: new Date(now.getTime() - 36 * 60 * 60 * 1000),
      confirmed_at: new Date(now.getTime() - 35 * 60 * 60 * 1000),
      updated_by: adminUserId
    },
    contract: {
      contract_number: `JUL27-${race.race_no}-${horseIdSuffix}-${participantIndex + 1}`,
      title: `${horse.name} Primary Jockey Contract`,
      file_url: 'https://example.com/demo-jockey-contract.pdf',
      file_type: 'application/pdf',
      file_name: 'demo-jockey-contract.pdf',
      signed_at: new Date(now.getTime() - 30 * 60 * 60 * 1000),
      uploaded_at: new Date(now.getTime() - 30 * 60 * 60 * 1000),
      confirmed_at: new Date(now.getTime() - 29 * 60 * 60 * 1000),
      note: 'Seeded contract for demo use only.'
    },
    invited_at: new Date(now.getTime() - 72 * 60 * 60 * 1000),
    responded_at: new Date(now.getTime() - 48 * 60 * 60 * 1000)
  };
}

function buildRegistration(tournament, race, horse, adminUserId, participantIndex) {
  const orderId = `VNPAY-JUL27-${race._id.toString().slice(-8).toUpperCase()}-${participantIndex + 1}`;
  const now = new Date();

  return {
    tournament_id: tournament._id,
    race_id: race._id,
    horse_id: horse._id,
    owner_id: getDocumentId(horse.owner_id),
    horse_no: participantIndex + 1,
    draw: participantIndex + 1,
    rating_snapshot: horse.current_rating || 50,
    gears: horse.default_gears || [],
    declared_weight_kg: 54 + participantIndex * 0.5,
    status: REGISTRATION_STATUS.APPROVED,
    note: 'Paid registration for Demo 27/07 spectator result test.',
    admin_note: 'Payment completed; entry finalized automatically.',
    entry_fee_vnd: ENTRY_FEE_VND,
    entry_fee_token: 0,
    payment_status: 'paid',
    payment_method: 'VNPAY',
    payment_order_id: orderId,
    gateway_reference_id: `${orderId}-GATEWAY`,
    payment_paid_at: new Date(now.getTime() - 72 * 60 * 60 * 1000),
    registered_at: new Date(now.getTime() - 73 * 60 * 60 * 1000),
    approved_by: adminUserId,
    approved_at: new Date(now.getTime() - 72 * 60 * 60 * 1000),
    entry_finalized_at: new Date(now.getTime() - 48 * 60 * 60 * 1000),
    entry_finalized_by: adminUserId
  };
}

async function seedDemoJuly27Races() {
  await connectDatabase();

  const existingTournament = await Tournament.findOne({ name: TOURNAMENT_NAME });

  if (existingTournament) {
    const demoReferee = await findDemoReferee();

    if (!demoReferee) {
      throw new Error('referee1@racing.test must have an active race referee profile.');
    }

    await Race.updateMany(
      { tournament_id: existingTournament._id },
      { $set: { referee_id: demoReferee._id } }
    );

    return summarizeTournament(existingTournament);
  }

  const pool = await loadSeedPool();
  const tournament = await Tournament.create({
    name: TOURNAMENT_NAME,
    description: 'Five fresh races for testing referee checks, Race Engine finish order, publication, and spectator result playback.',
    location: LOCATION,
    start_date: raceDateAt(RACE_TIMES[0]),
    end_date: raceDateAt(RACE_TIMES[RACE_TIMES.length - 1]),
    status: 'active',
    created_by: pool.admin._id
  });
  const round = await Round.create({
    tournament_id: tournament._id,
    name: 'Demo 27/07 Race Card',
    round_order: 1,
    description: 'Fresh race card without pre-checks, race runs, or results.',
    status: 'active'
  });
  const races = [];

  for (let raceIndex = 0; raceIndex < RACE_COUNT; raceIndex += 1) {
    const raceDate = raceDateAt(RACE_TIMES[raceIndex]);
    const referee = pool.referee;
    const race = await Race.create({
      tournament_id: tournament._id,
      round_id: round._id,
      name: `Demo 27/07 - Race ${raceIndex + 1}`,
      race_no: raceIndex + 1,
      race_date: raceDate,
      distance: RACE_DISTANCES[raceIndex],
      max_participants: PARTICIPANTS_PER_RACE,
      location: LOCATION,
      referee_id: referee._id,
      venue_code: 'SGR',
      course: 'A',
      race_class: String(Math.min(5, raceIndex + 1)),
      going: 'Good',
      surface: 'Turf',
      model_input_version: 1,
      registration_locked: true,
      entries_finalized_at: new Date(raceDate.getTime() - 24 * 60 * 60 * 1000),
      entries_finalized_by: pool.admin._id,
      status: 'scheduled',
      betting_status: 'unavailable',
      betting_market: {
        status: 'unavailable',
        min_stake: 1,
        max_stake: 1000,
        currency: 'TOKEN'
      },
      prize_pool: 30000000 + raceIndex * 5000000,
      prize_currency: 'VND',
      entry_fee: ENTRY_FEE_VND,
      entry_fee_currency: 'VND',
      prize_distribution: [
        { position: 1, percent: 60, label: 'Winner' },
        { position: 2, percent: 25, label: 'Runner-up' },
        { position: 3, percent: 15, label: 'Third place' }
      ]
    });
    const registrations = pool.horses.map(function(horse, participantIndex) {
      return buildRegistration(tournament, race, horse, pool.admin._id, participantIndex);
    });
    const assignments = pool.horses.map(function(horse, participantIndex) {
      return buildAssignment(
        race,
        horse,
        pool.jockeys[(participantIndex + raceIndex) % pool.jockeys.length],
        pool.admin._id,
        participantIndex
      );
    });

    await Registration.insertMany(registrations, { ordered: true });
    await JockeyAssignment.insertMany(assignments, { ordered: true });
    races.push({
      id: race._id.toString(),
      name: race.name,
      race_date: race.race_date,
      referee: referee.user_id && (referee.user_id.full_name || referee.user_id.email),
      participants: registrations.length,
      pre_checks: 0,
      race_run: false,
      results: 0
    });
  }

  return {
    reused: false,
    tournament: {
      id: tournament._id.toString(),
      name: tournament.name
    },
    races
  };
}

seedDemoJuly27Races()
  .then(async function(summary) {
    console.log(JSON.stringify(summary, null, 2));
    await mongoose.disconnect();
  })
  .catch(async function(error) {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  });
