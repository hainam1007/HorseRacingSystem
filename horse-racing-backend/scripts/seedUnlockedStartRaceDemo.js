require('dotenv').config();

const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const {
  Horse,
  HorseCheck,
  Jockey,
  JockeyAssignment,
  Race,
  RaceReferee,
  Registration,
  Round,
  Tournament,
  User
} = require('../models');

const PARTICIPANT_COUNT = 5;
const MAX_PARTICIPANTS = 8;
const ENTRY_FEE_VND = 500000;

async function findDemoUsers() {
  const [admin, refereeUser] = await Promise.all([
    User.findOne({ email: 'admin@racing.test' }),
    User.findOne({ email: 'referee@racing.test' })
  ]);

  if (!admin || !refereeUser) {
    throw new Error('Demo users are missing. Run the clean July demo seed first.');
  }

  const referee = await RaceReferee.findOne({
    user_id: refereeUser._id,
    status: 'active'
  });

  if (!referee) {
    throw new Error('Active referee@racing.test profile was not found.');
  }

  return { admin: admin, referee: referee };
}

async function findCurrentCompetition(now) {
  const tournament = await Tournament.findOne({
    start_date: { $lte: now },
    end_date: { $gte: now },
    status: { $ne: 'deleted' }
  }).sort({ start_date: -1 });

  if (!tournament) {
    throw new Error('No current tournament was found.');
  }

  const round = await Round.findOne({
    tournament_id: tournament._id,
    status: { $ne: 'deleted' }
  }).sort({ round_order: 1 });

  if (!round) {
    throw new Error('No round was found for the current tournament.');
  }

  return { tournament: tournament, round: round };
}

async function findEligibleAssignments(now) {
  const assignments = await JockeyAssignment.find({
    assignment_type: 'primary',
    status: 'accepted'
  }).sort({ responded_at: -1, invited_at: -1 });
  const selected = [];
  const horseIds = new Set();
  const jockeyIds = new Set();

  for (const assignment of assignments) {
    const horseId = String(assignment.horse_id);
    const jockeyId = String(assignment.jockey_id);

    if (horseIds.has(horseId) || jockeyIds.has(jockeyId)) {
      continue;
    }

    const [horse, jockey] = await Promise.all([
      Horse.findOne({ _id: assignment.horse_id, status: 'active' }),
      Jockey.findOne({ _id: assignment.jockey_id, status: 'active' })
    ]);

    if (!horse || !jockey) {
      continue;
    }

    if (jockey.suspended_until && new Date(jockey.suspended_until).getTime() > now.getTime()) {
      continue;
    }

    selected.push({
      assignment: assignment,
      horse: horse,
      jockey: jockey
    });
    horseIds.add(horseId);
    jockeyIds.add(jockeyId);

    if (selected.length === PARTICIPANT_COUNT) {
      break;
    }
  }

  if (selected.length < PARTICIPANT_COUNT) {
    throw new Error('At least five distinct accepted primary jockey assignments are required.');
  }

  return selected;
}

async function createRaceData() {
  await connectDatabase();

  const now = new Date();
  const raceDate = new Date(now.getTime() - 60 * 1000);
  const [{ admin, referee }, { tournament, round }, participants] = await Promise.all([
    findDemoUsers(),
    findCurrentCompetition(now),
    findEligibleAssignments(now)
  ]);
  const latestRace = await Race.findOne({ round_id: round._id }).sort({ race_no: -1 });
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const race = await Race.create({
    tournament_id: tournament._id,
    round_id: round._id,
    referee_id: referee._id,
    name: 'Unlocked Registration Start Demo ' + timestamp,
    race_no: Number(latestRace?.race_no || 0) + 1,
    race_date: raceDate,
    distance: 1200,
    max_participants: MAX_PARTICIPANTS,
    location: tournament.location || 'Phu Tho Racecourse, Ho Chi Minh City',
    venue_code: 'ST',
    course: 'B+2',
    race_class: '4',
    going: 'Good',
    surface: 'Turf',
    registration_locked: false,
    registration_slot_count: PARTICIPANT_COUNT,
    registration_slots_initialized: true,
    status: 'scheduled',
    betting_status: 'unavailable',
    entry_fee: ENTRY_FEE_VND,
    entry_fee_currency: 'VND',
    prize_pool: 50000000,
    prize_currency: 'VND',
    prize_distribution: [
      { position: 1, percent: 60, label: 'Winner' },
      { position: 2, percent: 25, label: 'Runner-up' },
      { position: 3, percent: 15, label: 'Third place' }
    ]
  });

  for (let index = 0; index < participants.length; index += 1) {
    const item = participants[index];
    const position = index + 1;
    const registeredAt = new Date(now.getTime() - (PARTICIPANT_COUNT - index) * 60000);

    await Registration.create({
      tournament_id: tournament._id,
      race_id: race._id,
      horse_id: item.horse._id,
      owner_id: item.assignment.owner_id,
      horse_no: position,
      draw: position,
      rating_snapshot: item.horse.current_rating || 50,
      gears: item.horse.default_gears || [],
      declared_weight_kg: item.jockey.weight_kg || 53,
      entry_finalized_at: now,
      entry_finalized_by: admin._id,
      status: 'approved',
      note: 'Paid and confirmed for unlocked registration start demo.',
      entry_fee_vnd: ENTRY_FEE_VND,
      payment_status: 'paid',
      payment_method: 'VNPAY',
      payment_paid_at: registeredAt,
      slot_reserved: true,
      slot_reserved_at: registeredAt,
      registered_at: registeredAt,
      approved_by: admin._id,
      approved_at: registeredAt
    });

    await JockeyAssignment.create({
      race_id: race._id,
      horse_id: item.horse._id,
      owner_id: item.assignment.owner_id,
      jockey_id: item.jockey._id,
      assignment_type: 'primary',
      status: 'accepted',
      invitation_message: 'Confirmed primary ride for start race validation demo.',
      responded_at: registeredAt
    });

    await HorseCheck.create({
      race_id: race._id,
      horse_id: item.horse._id,
      jockey_id: item.jockey._id,
      referee_id: referee._id,
      phase: 'pre_race',
      status: 'passed',
      checklist: {
        identity_verified: true,
        health_cleared: true,
        equipment_checked: true,
        weight_checked: true
      },
      health_status: 'fit',
      weight: item.horse.weight,
      check_note: 'Passed pre-race inspection for start race validation demo.',
      is_eligible: true,
      checked_at: new Date(now.getTime() - 30 * 60000)
    });
  }

  console.log('Unlocked registration start demo race created');
  console.log('Race ID:', race._id.toString());
  console.log('Race:', race.name);
  console.log('Tournament:', tournament.name);
  console.log('Race date:', race.race_date.toISOString());
  console.log('Registration locked:', race.registration_locked);
  console.log('Registration lock at:', race.registration_lock_at.toISOString());
  console.log('Participants:', PARTICIPANT_COUNT + '/' + MAX_PARTICIPANTS);
  console.log('Referee:', 'referee@racing.test');
  console.log('Password:', 'Password123');
}

createRaceData()
  .catch(function(error) {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async function() {
    await mongoose.disconnect();
  });
