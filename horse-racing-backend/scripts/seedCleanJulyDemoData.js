require('dotenv').config();

const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDatabase } = require('../config/database');
const models = require('../models');
const authService = require('../services/authService');
const adminDashboardService = require('../services/adminDashboardService');

const {
  Bet,
  DepositPackage,
  DepositRequest,
  Horse,
  HorseCheck,
  HorseOwner,
  Jockey,
  JockeyAssignment,
  Prize,
  PrizeAward,
  Race,
  RaceEngineRun,
  RaceOddsMarket,
  RaceReferee,
  RaceResult,
  RaceRun,
  RefereeReport,
  Registration,
  Role,
  Round,
  Tournament,
  TransactionHistory,
  User,
  UserRole,
  Violation,
  Wallet
} = models;

const PASSWORD = 'Password123';
const RESET_CONFIRMATION = 'RESET-HORSE-RACING-DEMO';
const EXPECTED_DATABASE = 'horse_racing';
const DEMO_NOW = process.env.DEMO_SEED_NOW
  ? new Date(process.env.DEMO_SEED_NOW)
  : new Date();

const ROLE_DESCRIPTIONS = {
  admin: 'System administrator',
  horse_owner: 'Horse owner and stable manager',
  jockey: 'Professional jockey',
  race_referee: 'Race referee',
  spectator: 'Spectator account'
};

const USER_IMAGES = [
  'https://images.unsplash.com/photo-1560250097-0b93528c311a',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330'
];

const HORSE_IMAGES = [
  'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a',
  'https://images.unsplash.com/photo-1566251037378-5e04e3bec343',
  'https://images.unsplash.com/photo-1534773728080-33d31da27ae5',
  'https://images.unsplash.com/photo-1598974357801-cbca100e65d3',
  'https://images.unsplash.com/photo-1547581849-38ba650ad0de',
  'https://images.unsplash.com/photo-1551884831-bbf3cdc6469e',
  'https://images.unsplash.com/photo-1573751055635-a0ad5937fd37',
  'https://images.unsplash.com/photo-1527153857715-3908f2bae5e8',
  'https://images.unsplash.com/photo-1534307250431-efc29a7a0b02',
  'https://images.unsplash.com/photo-1587922546307-776227941871',
  'https://images.unsplash.com/photo-1559030623-0226b1241edd',
  'https://images.unsplash.com/photo-1534567110243-8875d64ca8ff'
];

const TOURNAMENT_IMAGES = [
  'https://images.unsplash.com/photo-1593179449458-e0d43d512551',
  'https://images.unsplash.com/photo-1508343919546-4a5792fee935'
];

const JOCKEY_SPECS = [
  { email: 'jockey1@racing.test', full_name: 'Jockey Alpha', height: 165, weight_kg: 52.5, experience_years: 6 },
  { email: 'jockey2@racing.test', full_name: 'Jockey Bravo', height: 168, weight_kg: 54.0, experience_years: 5 },
  { email: 'jockey3@racing.test', full_name: 'Jockey Charlie', height: 166, weight_kg: 53.0, experience_years: 8 },
  { email: 'jockey4@racing.test', full_name: 'Jockey Delta', height: 169, weight_kg: 54.5, experience_years: 7 },
  { email: 'jockey5@racing.test', full_name: 'Jockey Echo', height: 164, weight_kg: 51.5, experience_years: 4 },
  { email: 'jockey6@racing.test', full_name: 'Jockey Foxtrot', height: 170, weight_kg: 55.0, experience_years: 9 },
  { email: 'jockey7@racing.test', full_name: 'Jockey Golf', height: 167, weight_kg: 53.5, experience_years: 6 },
  { email: 'jockey8@racing.test', full_name: 'Jockey Hotel', height: 171, weight_kg: 55.5, experience_years: 10 }
];

const OWNER_SPECS = [
  {
    email: 'horseowner@racing.test',
    full_name: 'Eleanor Hart',
    stable_name: 'Hartwell Racing Stable',
    address: 'District 11, Ho Chi Minh City'
  },
  {
    email: 'horseowner2@racing.test',
    full_name: 'Daniel Mercer',
    stable_name: 'Mekong Crown Stable',
    address: 'Thu Duc City, Ho Chi Minh City'
  },
  {
    email: 'horseowner3@racing.test',
    full_name: 'Olivia Bennett',
    stable_name: 'Golden Lotus Racing',
    address: 'Hai Chau District, Da Nang'
  }
];

const HORSE_SPECS = [
  { name: 'Saigon Thunder', owner: 0, breed: 'Thoroughbred', gender: 'male', color: 'Bay', weight: 478, gears: ['B', 'TT'] },
  { name: 'Mekong Star', owner: 0, breed: 'Thoroughbred', gender: 'female', color: 'Chestnut', weight: 466, gears: ['V'] },
  { name: 'Golden Lotus', owner: 1, breed: 'Thoroughbred', gender: 'female', color: 'Bay', weight: 472, gears: ['B'] },
  { name: 'Red River Spirit', owner: 1, breed: 'Thoroughbred', gender: 'male', color: 'Dark Bay', weight: 484, gears: ['TT'] },
  { name: 'Dragon Wind', owner: 2, breed: 'Thoroughbred', gender: 'male', color: 'Brown', weight: 481, gears: ['CP'] },
  { name: 'Emerald Victory', owner: 2, breed: 'Thoroughbred', gender: 'female', color: 'Grey', weight: 463, gears: ['V', 'TT'] },
  { name: 'Coastal Promise', owner: 0, breed: 'Thoroughbred', gender: 'male', color: 'Bay', weight: 475, gears: ['B'] },
  { name: 'Highland Crown', owner: 1, breed: 'Thoroughbred', gender: 'male', color: 'Chestnut', weight: 486, gears: ['H'] },
  { name: 'Silver Monsoon', owner: 2, breed: 'Thoroughbred', gender: 'female', color: 'Grey', weight: 468, gears: ['TT'] },
  { name: 'Royal Lantern', owner: 0, breed: 'Thoroughbred', gender: 'female', color: 'Bay', weight: 470, gears: ['V'] },
  { name: 'Northern Anthem', owner: 1, breed: 'Thoroughbred', gender: 'male', color: 'Brown', weight: 488, gears: ['B', 'TT'] },
  { name: 'Midnight Crown', owner: 2, breed: 'Thoroughbred', gender: 'male', color: 'Black', weight: 482, gears: ['CP'] }
];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function addHours(date, hours) {
  return new Date(date.getTime() + (hours * 60 * 60 * 1000));
}

function addDays(date, days) {
  return addHours(date, days * 24);
}

function dateAtIct(year, month, day, hour, minute = 0) {
  const monthValue = String(month).padStart(2, '0');
  const dayValue = String(day).padStart(2, '0');
  const hourValue = String(hour).padStart(2, '0');
  const minuteValue = String(minute).padStart(2, '0');

  return new Date(`${year}-${monthValue}-${dayValue}T${hourValue}:${minuteValue}:00.000+07:00`);
}

function localDateParts(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map(function(part) {
    return [part.type, part.value];
  }));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

function calculateRegistrationLockAt(raceDate) {
  return addHours(raceDate, -3);
}

function getDatabaseTarget() {
  const uri = process.env.MONGODB_URI || '';
  const withoutCredentials = uri.replace(/mongodb(\+srv)?:\/\/[^@]+@/, 'mongodb$1://');
  const host = (withoutCredentials.split('//')[1] || '').split('/')[0];

  return {
    database: process.env.MONGODB_DB_NAME || mongoose.connection.name,
    host,
    isAtlas: uri.startsWith('mongodb+srv://')
  };
}

function assertResetPermission() {
  const confirmation = getArgValue('--confirm');
  const target = getDatabaseTarget();

  if (!hasFlag('--reset')) {
    throw new Error('Reset requires --reset.');
  }

  if (confirmation !== RESET_CONFIRMATION) {
    throw new Error(`Reset requires --confirm ${RESET_CONFIRMATION}.`);
  }

  if (target.database !== EXPECTED_DATABASE) {
    throw new Error(`Refusing to reset unexpected database "${target.database}".`);
  }

  if (target.isAtlas && !hasFlag('--allow-atlas')) {
    throw new Error('Atlas reset requires --allow-atlas.');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset while NODE_ENV=production.');
  }
}

async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();

  for (const collection of collections) {
    await collection.deleteMany({});
  }
}

async function createRoles() {
  const roles = {};

  for (const [roleName, description] of Object.entries(ROLE_DESCRIPTIONS)) {
    roles[roleName] = await Role.create({
      role_name: roleName,
      description
    });
  }

  return roles;
}

async function createUser(options, roles, passwordHash, index) {
  const user = await User.create({
    full_name: options.full_name,
    email: options.email,
    password: passwordHash,
    phone_number: `090700${String(index).padStart(4, '0')}`,
    date_of_birth: new Date('1995-01-15T00:00:00.000Z'),
    avatar_url: USER_IMAGES[index % USER_IMAGES.length],
    status: 'active',
    email_verified: true,
    email_verified_at: DEMO_NOW,
    password_changed_at: DEMO_NOW
  });

  await UserRole.create({
    user_id: user._id,
    role_id: roles[options.role]._id
  });

  return user;
}

async function createAccountsAndProfiles(roles) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  let userIndex = 1;

  const admin = await createUser({
    email: 'admin@racing.test',
    full_name: 'Racing Administrator',
    role: 'admin'
  }, roles, passwordHash, userIndex++);

  const ownerUsers = [];
  const owners = [];

  for (let index = 0; index < OWNER_SPECS.length; index += 1) {
    const spec = OWNER_SPECS[index];
    const user = await createUser({
      email: spec.email,
      full_name: spec.full_name,
      role: 'horse_owner'
    }, roles, passwordHash, userIndex++);
    const owner = await HorseOwner.create({
      user_id: user._id,
      stable_name: spec.stable_name,
      address: spec.address,
      license_number: `OWN-VN-2026-${String(index + 1).padStart(3, '0')}`,
      status: 'active'
    });

    ownerUsers.push(user);
    owners.push(owner);
  }

  const jockeyUsers = [];
  const jockeys = [];

  for (let index = 0; index < JOCKEY_SPECS.length; index += 1) {
    const spec = JOCKEY_SPECS[index];
    const user = await createUser({
      email: spec.email,
      full_name: spec.full_name,
      role: 'jockey'
    }, roles, passwordHash, userIndex++);
    const jockey = await Jockey.create({
      user_id: user._id,
      height: spec.height,
      weight: spec.weight_kg,
      weight_kg: spec.weight_kg,
      experience_years: spec.experience_years,
      license_number: `JOC-VN-2026-${String(index + 1).padStart(3, '0')}`,
      total_races: index < 2 ? 0 : 6,
      total_wins: index < 2 ? 0 : index === 2 ? 2 : 1,
      suspended_until: null,
      outstanding_fine_amount: 0,
      disciplinary_status: 'clear',
      status: 'active'
    });

    jockeyUsers.push(user);
    jockeys.push(jockey);
  }

  const refereeSpecs = [
    { email: 'referee@racing.test', full_name: 'Referee Arthur Reed', experience_years: 10 },
    { email: 'referee2@racing.test', full_name: 'Referee Helen Ward', experience_years: 7 }
  ];
  const refereeUsers = [];
  const referees = [];

  for (let index = 0; index < refereeSpecs.length; index += 1) {
    const spec = refereeSpecs[index];
    const user = await createUser({
      email: spec.email,
      full_name: spec.full_name,
      role: 'race_referee'
    }, roles, passwordHash, userIndex++);
    const referee = await RaceReferee.create({
      user_id: user._id,
      license_number: `REF-VN-2026-${String(index + 1).padStart(3, '0')}`,
      experience_years: spec.experience_years,
      status: 'active'
    });

    refereeUsers.push(user);
    referees.push(referee);
  }

  const spectatorUsers = [];

  for (let index = 1; index <= 5; index += 1) {
    spectatorUsers.push(await createUser({
      email: `spectator${index}@racing.test`,
      full_name: `Spectator ${index}`,
      role: 'spectator'
    }, roles, passwordHash, userIndex++));
  }

  return {
    admin,
    ownerUsers,
    owners,
    jockeyUsers,
    jockeys,
    refereeUsers,
    referees,
    spectatorUsers
  };
}

async function createHorses(owners, admin) {
  const horses = [];

  for (let index = 0; index < HORSE_SPECS.length; index += 1) {
    const spec = HORSE_SPECS[index];

    horses.push(await Horse.create({
      owner_id: owners[spec.owner]._id,
      name: spec.name,
      breed: spec.breed,
      gender: spec.gender,
      date_of_birth: new Date(`${2019 + (index % 3)}-03-15T00:00:00.000Z`),
      color: spec.color,
      weight: spec.weight,
      current_rating: 48 + (index % 8),
      rating_updated_at: DEMO_NOW,
      rating_updated_by: admin._id,
      default_gears: spec.gears,
      health_status: 'healthy',
      registration_number: `VN-HORSE-2026-${String(index + 1).padStart(3, '0')}`,
      image_url: HORSE_IMAGES[index % HORSE_IMAGES.length],
      status: 'active'
    }));
  }

  return horses;
}

async function createPrizeConfiguration(race, positions) {
  const percentages = [60, 20, 11, 6, 3];
  const labels = ['Champion', 'Runner-up', 'Third Place', 'Fourth Place', 'Fifth Place'];
  const prizes = [];

  for (let index = 0; index < positions; index += 1) {
    prizes.push(await Prize.create({
      tournament_id: race.tournament_id,
      race_id: race._id,
      prize_name: `${race.name} - ${labels[index]}`,
      position: index + 1,
      amount: Math.round(race.prize_pool * percentages[index] / 100),
      percent: percentages[index],
      currency: 'VND',
      description: labels[index]
    }));
  }

  return prizes;
}

function acceptedAssignmentPayload(options) {
  const meetingTime = addDays(options.race.race_date, -5);
  const agreedAt = addHours(meetingTime, 1);

  return {
    race_id: options.race._id,
    horse_id: options.horse._id,
    owner_id: options.horse.owner_id,
    jockey_id: options.jockey._id,
    assignment_type: 'primary',
    status: 'accepted',
    invitation_message: `Primary riding invitation for ${options.horse.name}.`,
    meeting: {
      title: `${options.horse.name} race appointment`,
      meeting_time: meetingTime,
      location_name: 'Saigon Racing Operations Office',
      address: '125 Le Dai Hanh Street, District 11',
      city: 'Ho Chi Minh City',
      district: 'District 11',
      ward: 'Ward 13',
      contact_name: 'Race Operations',
      contact_phone: '0907000000',
      note: 'Completed offline appointment.',
      accepted_at: addHours(meetingTime, 0.5),
      response_message: 'Appointment accepted.'
    },
    terms: {
      agreed_terms: 'Standard primary race riding terms.',
      meeting_note: 'Race schedule and safety responsibilities confirmed.',
      agreed_at: agreedAt,
      sent_at: agreedAt,
      confirmed_at: addHours(agreedAt, 0.25),
      response_message: 'Terms confirmed.',
      updated_by: options.admin._id
    },
    contract: {
      contract_number: `CTR-${options.race.race_no}-${options.horse.registration_number}`,
      title: `${options.horse.name} Primary Riding Contract`,
      file_url: 'https://res.cloudinary.com/demo/raw/upload/primary-riding-contract.pdf',
      file_type: 'application/pdf',
      file_name: 'primary-riding-contract.pdf',
      signed_at: addHours(agreedAt, 0.5),
      uploaded_at: addHours(agreedAt, 0.5),
      confirmed_at: addHours(agreedAt, 0.75),
      response_message: 'Contract confirmed.',
      note: 'Seeded confirmed primary contract.'
    },
    response_message: 'Primary assignment accepted.',
    invited_at: meetingTime,
    responded_at: addHours(agreedAt, 0.75)
  };
}

async function createRegistrationAndAssignment(options) {
  const registration = await Registration.create({
    tournament_id: options.race.tournament_id,
    race_id: options.race._id,
    horse_id: options.horse._id,
    owner_id: options.horse.owner_id,
    horse_no: options.finalized ? options.position : undefined,
    draw: options.finalized ? options.position : undefined,
    rating_snapshot: options.finalized ? options.horse.current_rating : undefined,
    gears: options.horse.default_gears,
    declared_weight_kg: 53 + (options.position * 0.5),
    entry_finalized_at: options.finalized ? addDays(options.race.race_date, -2) : undefined,
    entry_finalized_by: options.finalized ? options.admin._id : undefined,
    status: 'approved',
    note: options.historical
      ? 'Approved historical July race entry.'
      : 'Paid and approved current demo race entry.',
    admin_note: 'Clean demo seed entry.',
    entry_fee_vnd: options.race.entry_fee,
    entry_fee_token: 0,
    payment_status: 'paid',
    payment_method: 'VNPAY',
    payment_order_id: `REG-${options.code}-${options.position}`,
    gateway_reference_id: `VNPAY-${options.code}-${options.position}`,
    payment_paid_at: addDays(options.race.race_date, -8),
    slot_reserved: true,
    slot_reserved_at: addDays(options.race.race_date, -8),
    registered_at: addDays(options.race.race_date, -8),
    approved_by: options.admin._id,
    approved_at: addDays(options.race.race_date, -8)
  });

  const assignment = await JockeyAssignment.create(acceptedAssignmentPayload(options));

  return { registration, assignment };
}

function buildOddsEntries(participants) {
  const probabilities = [0.28, 0.23, 0.19, 0.16, 0.14];

  return participants.map(function(participant, index) {
    const probability = probabilities[index];
    const fairOdds = Number((1 / probability).toFixed(2));
    const gameOdds = Number((fairOdds * 0.85).toFixed(2));

    return {
      horse_id: participant.horse._id,
      jockey_id: participant.jockey._id,
      horse_no: index + 1,
      horse_name: participant.horse.name,
      jockey_name: JOCKEY_SPECS[index + 2].full_name,
      win_probability: probability,
      fair_odds: fairOdds,
      generated_game_odds: gameOdds,
      game_odds: gameOdds,
      probability_rank: index + 1,
      fallbacks_used: []
    };
  });
}

async function seedHistoricalRace(options) {
  const race = await Race.create({
    tournament_id: options.tournament._id,
    round_id: options.round._id,
    name: options.name,
    image_url: TOURNAMENT_IMAGES[0],
    race_no: options.raceNo,
    race_date: options.raceDate,
    distance: 1200 + ((options.raceNo % 3) * 200),
    max_participants: 8,
    location: 'Phu Tho Racecourse, Ho Chi Minh City',
    venue_code: 'ST',
    course: 'B+2',
    race_class: String(3 + (options.raceNo % 3)),
    going: 'Good',
    surface: 'Turf',
    referee_id: options.referee._id,
    registration_locked: true,
    registration_slot_count: 5,
    registration_slots_initialized: true,
    entries_finalized_at: addDays(options.raceDate, -2),
    entries_finalized_by: options.admin._id,
    model_input_version: 1,
    status: 'completed',
    starting_at: options.raceDate,
    started_at: options.raceDate,
    assignment_revision: 5,
    betting_status: 'settled',
    betting_closes_at: addHours(options.raceDate, -0.1),
    betting_market: {
      status: 'settled',
      opens_at: addDays(options.raceDate, -3),
      closes_at: addHours(options.raceDate, -0.1),
      min_stake: 5,
      max_stake: 500,
      currency: 'TOKEN'
    },
    entry_fee: 50000,
    entry_fee_currency: 'VND',
    prize_pool: 60000000 + (options.raceNo * 5000000),
    prize_currency: 'VND',
    prize_distribution: [
      { position: 1, percent: 60, label: 'Champion' },
      { position: 2, percent: 20, label: 'Runner-up' },
      { position: 3, percent: 11, label: 'Third Place' },
      { position: 4, percent: 6, label: 'Fourth Place' },
      { position: 5, percent: 3, label: 'Fifth Place' }
    ]
  });

  const participantHorses = options.horses.slice(1, 6);
  const participantJockeys = options.jockeys.slice(2, 7);
  const participants = [];

  for (let index = 0; index < 5; index += 1) {
    const horse = participantHorses[index];
    const jockey = participantJockeys[index];
    const created = await createRegistrationAndAssignment({
      race,
      horse,
      jockey,
      admin: options.admin,
      position: index + 1,
      finalized: true,
      historical: true,
      code: `HIST-${options.raceNo}`
    });

    participants.push({ horse, jockey, assignment: created.assignment });

    await HorseCheck.create([
      {
        race_id: race._id,
        horse_id: horse._id,
        jockey_id: jockey._id,
        referee_id: options.referee._id,
        phase: 'pre_race',
        status: 'passed',
        checklist: {
          identity_verified: true,
          registration_valid: true,
          jockey_assigned: true,
          jockey_contract_confirmed: true,
          horse_health_status_ok: true,
          no_visible_lameness: true,
          no_visible_injury: true,
          normal_gait: true,
          normal_breathing: true,
          equipment_ok: true,
          fit_to_race: true
        },
        issues: [],
        health_status: 'healthy',
        weight: horse.weight,
        check_note: 'Historical pre-race inspection passed.',
        is_eligible: true,
        checked_at: addHours(race.race_date, -2)
      },
      {
        race_id: race._id,
        horse_id: horse._id,
        jockey_id: jockey._id,
        referee_id: options.referee._id,
        phase: 'post_race',
        status: 'normal',
        checklist: {
          horse_finished_safely: true,
          post_race_lameness_check: true,
          post_race_injury_check: true,
          breathing_recovered: true,
          heart_rate_recovered: true,
          bleeding_check: true,
          medical_follow_up_required: false
        },
        issues: [],
        health_status: 'stable',
        check_note: 'Historical post-race inspection completed without incident.',
        is_eligible: true,
        checked_at: addHours(race.race_date, 0.5)
      }
    ]);
  }

  const rotated = participants.slice(options.raceNo % 5).concat(participants.slice(0, options.raceNo % 5));
  const finishOrder = rotated.map(function(participant, index) {
    return {
      horse_id: participant.horse._id,
      jockey_id: participant.jockey._id,
      position: index + 1,
      finish_time: Number((70 + index * 1.35 + options.raceNo * 0.11).toFixed(3)),
      score: 100 - (index * 5)
    };
  });

  const raceRun = await RaceRun.create({
    race_id: race._id,
    status: 'used',
    generated_by: options.admin._id,
    generated_at: race.race_date,
    seed: `clean-july-historical-${options.raceNo}`,
    participants: participants.map(function(participant, index) {
      return {
        horse_id: participant.horse._id,
        jockey_id: participant.jockey._id,
        assignment_id: participant.assignment._id,
        lane: index + 1,
        seed_position: index + 1
      };
    }),
    finish_order: finishOrder
  });

  await RaceEngineRun.create({
    race_id: race._id,
    engine_run_id: `ENGINE-HIST-${options.raceNo}`,
    status: 'completed',
    started_at: race.race_date,
    completed_at: addHours(race.race_date, 0.25)
  });

  const resultByHorse = new Map();

  for (const finish of finishOrder) {
    const result = await RaceResult.create({
      race_id: race._id,
      horse_id: finish.horse_id,
      jockey_id: finish.jockey_id,
      position: finish.position,
      finish_time: finish.finish_time,
      score: finish.score,
      raw_position: finish.position,
      raw_finish_time: finish.finish_time,
      raw_score: finish.score,
      final_position: finish.position,
      final_finish_time: finish.finish_time,
      final_score: finish.score,
      applied_violation_ids: [],
      penalty_snapshot_violation_ids: [],
      penalties_applied_by: options.referee.user_id,
      penalties_applied_at: addHours(race.race_date, 1),
      submitted_to_admin_by: options.referee.user_id,
      submitted_to_admin_at: addHours(race.race_date, 1.1),
      status: 'published',
      note: 'Published historical clean result.',
      correction_requested: false,
      recorded_by: options.referee._id,
      recorded_at: addHours(race.race_date, 0.5),
      confirmed_by: options.admin._id,
      confirmed_at: addHours(race.race_date, 1.25),
      published_by: options.admin._id,
      published_at: addHours(race.race_date, 1.5)
    });

    resultByHorse.set(String(finish.horse_id), result);
  }

  await RefereeReport.create({
    race_id: race._id,
    referee_id: options.referee._id,
    report_title: `Official Report - ${race.name}`,
    report_content: 'Race completed normally with no recorded incidents.',
    race_condition: 'normal',
    weather: 'Sunny',
    track_condition: 'Good',
    conclusion: 'All participants completed the race without violations.',
    status: 'submitted',
    created_at: addHours(race.race_date, 0.5),
    submitted_at: addHours(race.race_date, 0.75)
  });

  const oddsEntries = buildOddsEntries(participants);
  const oddsMarket = await RaceOddsMarket.create({
    race_id: race._id,
    status: 'settled',
    model_name: 'probability_engine_history_v1',
    model_version: 'history_v1.0.0',
    source: 'clean_july_demo_seed',
    payout_factor: 0.85,
    model_input_version: 1,
    generated_by: options.admin._id,
    generated_at: addDays(race.race_date, -3),
    input_diagnostics: {
      participant_count: 5,
      fallback_count: 0,
      fallbacks_used: [],
      race_payload_id: `clean-historical-${options.raceNo}`
    },
    odds: oddsEntries
  });

  const prizes = await createPrizeConfiguration(race, 5);

  for (const finish of finishOrder) {
    const result = resultByHorse.get(String(finish.horse_id));
    const horse = options.horses.find(function(item) {
      return String(item._id) === String(finish.horse_id);
    });
    const grossAmount = prizes[finish.position - 1].amount;

    await PrizeAward.create({
      prize_id: prizes[finish.position - 1]._id,
      race_result_id: result._id,
      horse_id: horse._id,
      owner_id: horse.owner_id,
      jockey_id: finish.jockey_id,
      position: finish.position,
      amount: grossAmount,
      gross_amount: grossAmount,
      owner_amount: Math.round(grossAmount * 0.9),
      jockey_amount: Math.round(grossAmount * 0.1),
      currency: 'VND',
      status: 'paid',
      awarded_at: addHours(race.race_date, 1.5),
      calculated_at: addHours(race.race_date, 1.5),
      approved_at: addHours(race.race_date, 1.75),
      approved_by: options.admin._id,
      paid_at: addHours(race.race_date, 2),
      paid_by: options.admin._id
    });
  }

  return {
    race,
    raceRun,
    oddsMarket,
    participants,
    finishOrder,
    resultByHorse
  };
}

async function seedHistoricalTournament(context) {
  const year = localDateParts(DEMO_NOW).year;
  const tournament = await Tournament.create({
    name: `July Heritage Racing Festival ${year}`,
    description: 'Completed July races used for dashboard, result, prize, and betting history.',
    location: 'Phu Tho Racecourse, Ho Chi Minh City',
    image_url: TOURNAMENT_IMAGES[0],
    start_date: dateAtIct(year, 7, 1, 8),
    end_date: dateAtIct(year, 7, 15, 18),
    status: 'completed',
    created_by: context.admin._id
  });
  const qualificationRound = await Round.create({
    tournament_id: tournament._id,
    name: 'Heritage Qualifiers',
    round_order: 1,
    description: 'Completed qualification races.',
    status: 'completed'
  });
  const finalRound = await Round.create({
    tournament_id: tournament._id,
    name: 'Heritage Finals',
    round_order: 2,
    description: 'Completed final races.',
    status: 'completed'
  });
  const raceDays = [3, 5, 7, 9, 11, 13];
  const races = [];

  for (let index = 0; index < raceDays.length; index += 1) {
    races.push(await seedHistoricalRace({
      tournament,
      round: index < 4 ? qualificationRound : finalRound,
      name: index < 4
        ? `Heritage Sprint ${index + 1}`
        : `Heritage Final ${index - 3}`,
      raceNo: index + 1,
      raceDate: dateAtIct(year, 7, raceDays[index], index % 2 === 0 ? 9 : 15),
      referee: context.referees[index % context.referees.length],
      admin: context.admin,
      horses: context.horses,
      jockeys: context.jockeys
    }));
  }

  return { tournament, races };
}

async function seedSpectatorFinance(context, historical) {
  const depositPackage = await DepositPackage.create({
    package_id: 'PKG_500K',
    label: '500,000 VND Demo Package',
    vnd_price: 500000,
    token_received: 500,
    bonus_token: 50,
    is_active: true
  });
  const balances = new Map();

  for (let index = 0; index < context.spectatorUsers.length; index += 1) {
    const user = context.spectatorUsers[index];
    balances.set(String(user._id), 550);

    await DepositRequest.create({
      order_id: `ORDER-JULY-${index + 1}`,
      user_id: user._id,
      package_id: depositPackage.package_id,
      total_vnd: 500000,
      total_token: 550,
      payment_method: 'VNPAY',
      status: 'success',
      gateway_reference_id: `VNPAY-DEPOSIT-JULY-${index + 1}`,
      note: 'Successful July demo token deposit.',
      created_at: dateAtIct(localDateParts(DEMO_NOW).year, 7, 1 + index, 8)
    });

    await TransactionHistory.create({
      user_id: user._id,
      transaction_type: 'deposit',
      amount: 550,
      direction: 'credit',
      balance_before: 0,
      balance_after: 550,
      status: 'completed',
      reference_id: `TX-DEPOSIT-JULY-${index + 1}`,
      note: 'Initial July demo token deposit.',
      created_at: dateAtIct(localDateParts(DEMO_NOW).year, 7, 1 + index, 8)
    });
  }

  for (let raceIndex = 0; raceIndex < historical.races.length; raceIndex += 1) {
    const raceData = historical.races[raceIndex];
    const winner = raceData.finishOrder.find(function(item) {
      return item.position === 1;
    });

    for (let spectatorIndex = 0; spectatorIndex < context.spectatorUsers.length; spectatorIndex += 1) {
      const user = context.spectatorUsers[spectatorIndex];
      const userKey = String(user._id);
      const predictedParticipant = raceData.participants[(spectatorIndex + raceIndex) % 5];
      const predictedOdds = raceData.oddsMarket.odds.find(function(item) {
        return String(item.horse_id) === String(predictedParticipant.horse._id);
      });
      const stake = 20 + (spectatorIndex * 5);
      const beforeStake = balances.get(userKey);
      const afterStake = beforeStake - stake;
      const won = String(predictedParticipant.horse._id) === String(winner.horse_id);
      const payout = won ? Number((stake * predictedOdds.game_odds).toFixed(2)) : 0;
      const result = raceData.resultByHorse.get(String(winner.horse_id));
      const submittedAt = addDays(raceData.race.race_date, -1);

      balances.set(userKey, afterStake + payout);

      await TransactionHistory.create({
        user_id: user._id,
        transaction_type: 'bet_deduct',
        amount: stake,
        direction: 'debit',
        balance_before: beforeStake,
        balance_after: afterStake,
        status: 'completed',
        reference_id: `TX-BET-${raceIndex + 1}-${spectatorIndex + 1}`,
        note: `Win bet on ${predictedParticipant.horse.name}.`,
        created_at: submittedAt
      });

      if (won) {
        await TransactionHistory.create({
          user_id: user._id,
          transaction_type: 'bet_win',
          amount: payout,
          direction: 'credit',
          balance_before: afterStake,
          balance_after: afterStake + payout,
          status: 'completed',
          reference_id: `TX-WIN-${raceIndex + 1}-${spectatorIndex + 1}`,
          note: `Winning payout for ${raceData.race.name}.`,
          created_at: addHours(raceData.race.race_date, 2)
        });
      }

      await Bet.create({
        spectator_id: user._id,
        race_id: raceData.race._id,
        predicted_horse_id: predictedParticipant.horse._id,
        stake_amount: stake,
        odds_market_id: raceData.oddsMarket._id,
        odds_snapshot: {
          market_id: raceData.oddsMarket._id,
          model_name: raceData.oddsMarket.model_name,
          model_version: raceData.oddsMarket.model_version,
          generated_at: raceData.oddsMarket.generated_at,
          payout_factor: raceData.oddsMarket.payout_factor,
          horse_no: predictedOdds.horse_no,
          horse_name: predictedOdds.horse_name,
          win_probability: predictedOdds.win_probability,
          fair_odds: predictedOdds.fair_odds,
          game_odds: predictedOdds.game_odds,
          probability_rank: predictedOdds.probability_rank
        },
        potential_payout: Number((stake * predictedOdds.game_odds).toFixed(2)),
        payout_amount: payout,
        status: won ? 'won' : 'lost',
        settled_result_id: result._id,
        settled_by: context.admin._id,
        settled_at: addHours(raceData.race.race_date, 2),
        submitted_at: submittedAt,
        checked_at: addHours(raceData.race.race_date, 2)
      });
    }
  }

  for (const user of context.spectatorUsers) {
    await Wallet.create({
      user_id: user._id,
      token_balance: Number(balances.get(String(user._id)).toFixed(2))
    });
  }
}

async function seedCurrentRace(options) {
  const race = await Race.create({
    tournament_id: options.tournament._id,
    round_id: options.round._id,
    name: options.name,
    image_url: TOURNAMENT_IMAGES[1],
    race_no: options.raceNo,
    race_date: options.raceDate,
    distance: options.distance,
    max_participants: 8,
    location: options.location,
    venue_code: 'ST',
    course: 'B+2',
    race_class: '4',
    going: 'Good',
    surface: 'Turf',
    referee_id: options.referee._id,
    registration_locked: false,
    registration_slot_count: 5,
    registration_slots_initialized: true,
    model_input_version: 0,
    status: 'scheduled',
    assignment_revision: 5,
    betting_status: 'unavailable',
    betting_market: {
      status: 'unavailable',
      min_stake: 5,
      max_stake: 500,
      currency: 'TOKEN'
    },
    entry_fee: 50000,
    entry_fee_currency: 'VND',
    prize_pool: options.prizePool,
    prize_currency: 'VND',
    prize_distribution: [
      { position: 1, percent: 60, label: 'Champion' },
      { position: 2, percent: 20, label: 'Runner-up' },
      { position: 3, percent: 11, label: 'Third Place' },
      { position: 4, percent: 6, label: 'Fourth Place' },
      { position: 5, percent: 3, label: 'Fifth Place' }
    ]
  });

  const participantHorses = options.horses.slice(1, 6);
  const participantJockeys = options.jockeys.slice(2, 7);

  for (let index = 0; index < 5; index += 1) {
    await createRegistrationAndAssignment({
      race,
      horse: participantHorses[index],
      jockey: participantJockeys[index],
      admin: options.admin,
      position: index + 1,
      finalized: false,
      historical: false,
      code: `CURRENT-${options.raceNo}`
    });
  }

  await createPrizeConfiguration(race, 5);

  return race;
}

async function seedCurrentTournament(context) {
  const raceOffsets = [6, 10, 24, 32, 35];
  const raceDates = raceOffsets.map(function(offset) {
    return addHours(DEMO_NOW, offset);
  });
  const tournament = await Tournament.create({
    name: 'Saigon Summer Racing Cup 2026',
    description: 'Current clean demo tournament with five open races and room for three additional entries per race.',
    location: 'Ho Chi Minh City',
    image_url: TOURNAMENT_IMAGES[1],
    start_date: DEMO_NOW,
    end_date: addDays(raceDates[raceDates.length - 1], 1),
    status: 'active',
    created_by: context.admin._id
  });
  const openingRound = await Round.create({
    tournament_id: tournament._id,
    name: 'Opening Round',
    round_order: 1,
    description: 'Open races for registration and jockey invitation demonstrations.',
    status: 'active'
  });
  const championshipRound = await Round.create({
    tournament_id: tournament._id,
    name: 'Championship Round',
    round_order: 2,
    description: 'Later races in the current demo tournament.',
    status: 'scheduled'
  });
  const specs = [
    { name: 'Independence Sprint', distance: 1200, location: 'Phu Tho Racecourse, Ho Chi Minh City', prizePool: 100000000 },
    { name: 'Mekong Challenge', distance: 1400, location: 'Phu Tho Racecourse, Ho Chi Minh City', prizePool: 80000000 },
    { name: 'Golden Lotus Cup', distance: 1600, location: 'Saigon Turf Club, Ho Chi Minh City', prizePool: 120000000 },
    { name: 'Saigon Evening Stakes', distance: 1200, location: 'Saigon Turf Club, Ho Chi Minh City', prizePool: 90000000 },
    { name: 'Unity Championship', distance: 1800, location: 'Phu Tho Racecourse, Ho Chi Minh City', prizePool: 150000000 }
  ];
  const races = [];

  for (let index = 0; index < specs.length; index += 1) {
    races.push(await seedCurrentRace({
      tournament,
      round: index < 3 ? openingRound : championshipRound,
      raceNo: index + 1,
      raceDate: raceDates[index],
      referee: context.referees[index % context.referees.length],
      admin: context.admin,
      horses: context.horses,
      jockeys: context.jockeys,
      ...specs[index]
    }));
  }

  return { tournament, races };
}

async function verifySeed() {
  const now = new Date();
  const year = localDateParts(DEMO_NOW).year;
  const loginSpecs = [
    ['admin@racing.test', 'admin'],
    ['horseowner@racing.test', 'horse_owner'],
    ['jockey1@racing.test', 'jockey'],
    ['referee@racing.test', 'race_referee'],
    ['spectator1@racing.test', 'spectator']
  ];
  const loginChecks = [];

  for (const [email, expectedRole] of loginSpecs) {
    const auth = await authService.login({ email, password: PASSWORD });

    assert.ok(auth.roles.includes(expectedRole), `${email} must have role ${expectedRole}.`);
    loginChecks.push({
      email,
      expected_role: expectedRole,
      login: 'passed'
    });
  }

  const alpha = await User.findOne({ email: 'jockey1@racing.test' });
  const bravo = await User.findOne({ email: 'jockey2@racing.test' });
  const alphaProfile = await Jockey.findOne({ user_id: alpha._id });
  const bravoProfile = await Jockey.findOne({ user_id: bravo._id });
  const openEntryHorse = await Horse.findOne({ name: 'Saigon Thunder' });
  const scheduledRaces = await Race.find({ status: 'scheduled' }).sort({ race_date: 1 });
  const completedRaces = await Race.find({ status: 'completed' });
  const restrictedJockeys = await Jockey.countDocuments({
    $or: [
      { status: { $ne: 'active' } },
      { disciplinary_status: { $ne: 'clear' } },
      { suspended_until: { $gt: now } }
    ]
  });

  assert.equal(await User.countDocuments(), 19, 'Expected 19 demo users.');
  assert.equal(await Tournament.countDocuments(), 2, 'Expected two tournaments.');
  assert.equal(completedRaces.length, 6, 'Expected six completed historical races.');
  assert.equal(scheduledRaces.length, 5, 'Expected five scheduled demo races.');
  assert.equal(await Violation.countDocuments(), 0, 'Expected no seeded violations.');
  assert.equal(await JockeyAssignment.countDocuments({ jockey_id: alphaProfile._id }), 0, 'Jockey Alpha must remain unassigned.');
  assert.equal(await JockeyAssignment.countDocuments({ jockey_id: bravoProfile._id }), 0, 'Jockey Bravo must remain unassigned.');
  assert.equal(alphaProfile.disciplinary_status, 'clear', 'Jockey Alpha must not be suspended.');
  assert.equal(bravoProfile.disciplinary_status, 'clear', 'Jockey Bravo must not be suspended.');
  assert.equal(restrictedJockeys, 0, 'Every seeded jockey must be active and free of suspension.');
  assert.equal(
    await Registration.countDocuments({ horse_id: openEntryHorse._id, race_id: { $in: scheduledRaces.map((race) => race._id) } }),
    0,
    'Saigon Thunder must remain available for owner registration demos.'
  );

  for (const race of scheduledRaces) {
    const [registrations, assignments, checks, results, odds] = await Promise.all([
      Registration.countDocuments({ race_id: race._id, status: 'approved', payment_status: 'paid' }),
      JockeyAssignment.countDocuments({ race_id: race._id, assignment_type: 'primary', status: 'accepted' }),
      HorseCheck.countDocuments({ race_id: race._id }),
      RaceResult.countDocuments({ race_id: race._id }),
      RaceOddsMarket.countDocuments({ race_id: race._id })
    ]);

    assert.equal(registrations, 5, `${race.name} must have five paid approved entries.`);
    assert.equal(assignments, 5, `${race.name} must have five accepted primary jockeys.`);
    assert.equal(checks, 0, `${race.name} must remain ready for referee pre-check demo.`);
    assert.equal(results, 0, `${race.name} must not have results yet.`);
    assert.equal(odds, 0, `${race.name} must remain ready for odds generation.`);
    assert.equal(race.max_participants, 8, `${race.name} must allow eight participants.`);
    assert.equal(race.registration_slot_count, 5, `${race.name} must reserve five places.`);
    assert.equal(race.registration_locked, false, `${race.name} registration must be open.`);
    assert.ok(race.registration_lock_at > now, `${race.name} registration lock time must be in the future.`);
  }

  for (const race of completedRaces) {
    const [registrations, assignments, preChecks, postChecks, results, reports] = await Promise.all([
      Registration.countDocuments({ race_id: race._id, status: 'approved' }),
      JockeyAssignment.countDocuments({ race_id: race._id, status: 'accepted' }),
      HorseCheck.countDocuments({ race_id: race._id, phase: 'pre_race', status: 'passed' }),
      HorseCheck.countDocuments({ race_id: race._id, phase: 'post_race', status: 'normal' }),
      RaceResult.countDocuments({ race_id: race._id, status: 'published' }),
      RefereeReport.countDocuments({ race_id: race._id, status: 'submitted' })
    ]);

    assert.equal(registrations, 5, `${race.name} must have five historical entries.`);
    assert.equal(assignments, 5, `${race.name} must have five accepted assignments.`);
    assert.equal(preChecks, 5, `${race.name} must have five passed pre-checks.`);
    assert.equal(postChecks, 5, `${race.name} must have five normal post-checks.`);
    assert.equal(results, 5, `${race.name} must have five published results.`);
    assert.equal(reports, 1, `${race.name} must have one submitted report.`);
    assert.equal(race.registration_locked, true, `${race.name} registration must remain locked.`);
  }

  const dashboard = await adminDashboardService.getDashboardSummary(
    `${year}-07-01`,
    `${year}-07-31`
  );

  assert.equal(dashboard.metrics.races_held.value, 6, 'Dashboard must show six completed July races.');
  assert.equal(dashboard.metrics.stakes_tokens.count, 30, 'Dashboard must show 30 settled July bets.');
  assert.ok(dashboard.metrics.tokens_in_circulation > 0, 'Dashboard must show spectator tokens in circulation.');

  const summary = {
    users: await User.countDocuments(),
    roles: await Role.countDocuments(),
    horse_owners: await HorseOwner.countDocuments(),
    jockeys: await Jockey.countDocuments(),
    referees: await RaceReferee.countDocuments(),
    horses: await Horse.countDocuments(),
    tournaments: await Tournament.countDocuments(),
    races: await Race.countDocuments(),
    completed_races: completedRaces.length,
    scheduled_races: scheduledRaces.length,
    registrations: await Registration.countDocuments(),
    assignments: await JockeyAssignment.countDocuments(),
    published_results: await RaceResult.countDocuments({ status: 'published' }),
    bets: await Bet.countDocuments(),
    wallets: await Wallet.countDocuments(),
    violations: await Violation.countDocuments(),
    restricted_jockeys: restrictedJockeys,
    open_entry_horse: openEntryHorse.name,
    alpha_assignments: await JockeyAssignment.countDocuments({ jockey_id: alphaProfile._id }),
    bravo_assignments: await JockeyAssignment.countDocuments({ jockey_id: bravoProfile._id }),
    login_checks: loginChecks,
    dashboard: {
      period: dashboard.period,
      races_held: dashboard.metrics.races_held.value,
      bets: dashboard.metrics.stakes_tokens.count,
      stakes_tokens: dashboard.metrics.stakes_tokens.value,
      gross_gaming_margin_tokens: dashboard.metrics.gross_gaming_margin_tokens.value,
      tokens_in_circulation: dashboard.metrics.tokens_in_circulation
    },
    current_races: scheduledRaces.map(function(race) {
      return {
        id: race._id.toString(),
        name: race.name,
        race_date: race.race_date,
        participants: race.registration_slot_count,
        capacity: race.max_participants,
        registration_locked: race.registration_locked,
        registration_lock_at: race.registration_lock_at
      };
    })
  };

  return summary;
}

function printAccounts() {
  const accounts = [
    ['Admin', 'admin@racing.test'],
    ['Horse Owner', 'horseowner@racing.test'],
    ['Horse Owner', 'horseowner2@racing.test'],
    ['Horse Owner', 'horseowner3@racing.test'],
    ...JOCKEY_SPECS.map(function(spec) {
      return ['Jockey', spec.email];
    }),
    ['Race Referee', 'referee@racing.test'],
    ['Race Referee', 'referee2@racing.test'],
    ['Spectator', 'spectator1@racing.test'],
    ['Spectator', 'spectator2@racing.test'],
    ['Spectator', 'spectator3@racing.test'],
    ['Spectator', 'spectator4@racing.test'],
    ['Spectator', 'spectator5@racing.test']
  ];

  console.log('\nDemo accounts');
  console.log(`Password: ${PASSWORD}`);

  for (const [role, email] of accounts) {
    console.log(`${role.padEnd(14)} ${email}`);
  }

  console.log('\nReserved invitation jockeys');
  console.log('Jockey Alpha   jockey1@racing.test');
  console.log('Jockey Bravo   jockey2@racing.test');
}

async function run() {
  await connectDatabase();
  const target = getDatabaseTarget();

  console.log(`Connected to ${target.database} at ${target.host}.`);

  if (hasFlag('--verify-only')) {
    const summary = await verifySeed();
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  assertResetPermission();
  await clearDatabase();
  console.log('All existing collection data was removed.');

  const roles = await createRoles();
  const context = await createAccountsAndProfiles(roles);
  context.horses = await createHorses(context.owners, context.admin);

  const historical = await seedHistoricalTournament(context);
  await seedSpectatorFinance(context, historical);
  await seedCurrentTournament(context);

  const summary = await verifySeed();
  printAccounts();
  console.log('\nSeed verification');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nClean July demo data seeded successfully.');
}

run()
  .catch(function(error) {
    console.error(`Clean July seed failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(async function() {
    await mongoose.disconnect();
  });
