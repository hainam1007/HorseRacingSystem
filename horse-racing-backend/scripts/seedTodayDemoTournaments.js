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
  RaceOddsMarket,
  RaceRun,
  RaceReferee,
  Registration,
  Round,
  Tournament,
  User,
  UserRole,
  Role
} = require('../models');
const {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_TYPE,
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  REGISTRATION_STATUS
} = require('../constants/statuses');
const { HORSE_GEAR_CODES } = require('../constants/raceModelInput');
const { ROLE_NAMES } = require('../constants/roles');

const BATCH_PREFIX = 'Today Demo Full Flow';
const RACE_COUNT_PER_TOURNAMENT = 3;
const PARTICIPANTS_PER_RACE = 5;
const LOCK_OFFSET_MS = 3 * 60 * 60 * 1000;
const tournamentImages = [
  'https://upload.wikimedia.org/wikipedia/commons/4/48/GGF_Race5.jpg',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT1eBBm_P-QFmlqGsCPSzMhVvCLgox9RdzPLcjWYd5s7gjrsZDEmAo0r9Y&s=10',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRsBhvh6eZD9Po6EQggn33GSJ2HDxBbPfBsn0U8voOVqnilVhRjAeD2vL8&s=10',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSHIR1YaAw1iN9gOWTeEpJRIdyM2ZU2hyfGltYpQsOKBA&s',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQos0Yf2hCLEj8Zdvan6F_oqxJ7fgoFBz6pv83cDcDeO2VgF7uR5KnwDcY&s=10',
  'https://i.ytimg.com/vi/DcKduq72F3s/maxresdefault.jpg',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_pohoZ7249yBzQjLVn3tdU1AJc_EyWl8S1sNGh4aNKEvFmHSvvCzTW-UH&s=10',
  'https://static.vecteezy.com/system/resources/thumbnails/056/330/676/small_2x/cartoon-hippodrome-competition-horse-race-track-with-jockey-riding-horses-equestrian-sport-and-horse-riders-compete-fast-galloping-tournament-illustration-vector.jpg',
  'https://static.vecteezy.com/system/resources/previews/043/336/525/non_2x/horse-racing-competition-illustration-with-equestrian-performance-sport-and-rider-or-jockeys-in-a-racecourse-on-flat-cartoon-background-vector.jpg',
  'https://tscom.imgix.net/Keeneland_Scenics_Keeneland_3_27482bc9c0.jpg?auto=compress,format',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT6AtOlQwndBjMfZiuXr4F1E9nQbgYr9wvhAtoCvhCH4fexRSi1vS-27D0&s=10',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQBxdTiAyxKOJ1qDBVXSyJ3QAz_FqmeZ_o2UDxJlPxtOYUlMjjC6RCX5R34&s=10',
  'https://tscom.imgix.net/Keeneland_Scenics_Keeneland_3_27482bc9c0.jpg?auto=compress,format',
  'https://thumbs.dreamstime.com/b/horse-racing-tournament-flat-style-colorful-vector-illustration-jockeys-sprinting-horses-280854880.jpg',
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTqPcsP_eWFAOV6F8--oSDELEwJ3JuQumnrrY_xB6hU8cHXlmxN3EBBNoL4&s=10'
];

function startOfLocalDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function withLocalTime(day, hour, minute) {
  const next = new Date(day);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function formatDateCode(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

function calculateEntryFee(raceSpecs) {
  const totalPrizePool = raceSpecs.reduce(function(total, spec) {
    return total + spec.prizePool;
  }, 0);
  const totalSlots = raceSpecs.reduce(function(total, spec) {
    return total + spec.maxParticipants;
  }, 0);

  return Math.ceil(totalPrizePool / Math.max(1, totalSlots));
}

function calculateRegistrationLockAt(raceDate) {
  return new Date(raceDate.getTime() - LOCK_OFFSET_MS);
}

function pickRound(rounds, raceIndex) {
  return rounds[Math.min(raceIndex, rounds.length - 1)];
}

async function findAdminUserId() {
  const adminRole = await Role.findOne({ role_name: ROLE_NAMES.ADMIN }).lean();

  if (!adminRole) {
    return undefined;
  }

  const adminLink = await UserRole.findOne({ role_id: adminRole._id }).lean();

  return adminLink && adminLink.user_id;
}

async function cleanupExistingBatch() {
  const tournaments = await Tournament.find({
    name: { $regex: `^${BATCH_PREFIX}` }
  }).select('_id').lean();
  const tournamentIds = tournaments.map(function(tournament) {
    return tournament._id;
  });

  if (!tournamentIds.length) {
    return {
      tournaments: 0,
      rounds: 0,
      races: 0,
      registrations: 0,
      assignments: 0,
      horse_checks: 0
    };
  }

  const races = await Race.find({ tournament_id: { $in: tournamentIds } }).select('_id').lean();
  const raceIds = races.map(function(race) {
    return race._id;
  });

  const [registrationResult, assignmentResult, horseCheckResult, raceRunResult, oddsResult, raceResult, roundResult, tournamentResult] = await Promise.all([
    Registration.deleteMany({ race_id: { $in: raceIds } }),
    JockeyAssignment.deleteMany({ race_id: { $in: raceIds } }),
    HorseCheck.deleteMany({ race_id: { $in: raceIds } }),
    RaceRun.deleteMany({ race_id: { $in: raceIds } }),
    RaceOddsMarket.deleteMany({ race_id: { $in: raceIds } }),
    Race.deleteMany({ _id: { $in: raceIds } }),
    Round.deleteMany({ tournament_id: { $in: tournamentIds } }),
    Tournament.deleteMany({ _id: { $in: tournamentIds } })
  ]);

  return {
    tournaments: tournamentResult.deletedCount || 0,
    rounds: roundResult.deletedCount || 0,
    races: raceResult.deletedCount || 0,
    registrations: registrationResult.deletedCount || 0,
    assignments: assignmentResult.deletedCount || 0,
    horse_checks: horseCheckResult.deletedCount || 0,
    race_runs: raceRunResult.deletedCount || 0,
    odds_markets: oddsResult.deletedCount || 0
  };
}

async function loadSeedPool() {
  const ownerUser = await User.findOne({ email: 'owner2@racing.test' }).select('_id').lean();
  const ownerProfile = ownerUser
    ? await HorseOwner.findOne({ user_id: ownerUser._id, status: 'active' }).select('_id').lean()
    : null;
  const jockeyAlpha = await User.findOne({ email: 'jockey1@racing.test' }).select('_id').lean();
  const refereeUsers = await User.find({
    email: { $in: ['referee1@racing.test', 'referee2@racing.test'] }
  }).select('_id').lean();

  const [horses, jockeys, referees, adminUserId] = await Promise.all([
    Horse.find({ status: 'active', owner_id: ownerProfile ? ownerProfile._id : undefined })
      .populate('owner_id')
      .sort({ created_at: 1 })
      .lean(),
    Jockey.find({
      status: 'active',
      user_id: { $ne: jockeyAlpha ? jockeyAlpha._id : null },
      $or: [
        { suspended_until: { $exists: false } },
        { suspended_until: null },
        { suspended_until: { $lte: new Date() } }
      ]
    }).sort({ total_wins: -1, experience_years: -1 }).lean(),
    RaceReferee.find({
      status: 'active',
      user_id: { $in: refereeUsers.map(function(user) { return user._id; }) }
    }).sort({ license_number: 1 }).lean(),
    findAdminUserId()
  ]);

  const eligibleHorses = horses.filter(function(horse) {
    const owner = horse.owner_id;

    return owner && owner._id && owner.status !== 'inactive';
  });

  if (!ownerProfile) {
    throw new Error('owner2@racing.test must have an active HorseOwner profile.');
  }

  if (eligibleHorses.length < PARTICIPANTS_PER_RACE) {
    throw new Error(`Need at least ${PARTICIPANTS_PER_RACE} active horses owned by owner2@racing.test.`);
  }

  if (jockeys.length < PARTICIPANTS_PER_RACE) {
    throw new Error(`Need at least ${PARTICIPANTS_PER_RACE} active jockeys`);
  }

  if (referees.length < 2) {
    throw new Error('referee1@racing.test and referee2@racing.test must have active referee profiles.');
  }

  return {
    horses: eligibleHorses,
    jockeys,
    referees,
    adminUserId
  };
}

function buildTournamentSpecs(today) {
  const venues = [
    'Da Nang Turf Club',
    'Saigon Riverside Track',
    'Hanoi Green Mile',
    'Hue Imperial Racecourse',
    'Can Tho Delta Downs',
    'Nha Trang Coastal Park',
    'Hoi An Lantern Circuit',
    'Vung Tau Seaside Arena',
    'Da Lat Highland Track',
    'Phu Quoc Island Course'
  ];
  const themes = [
    'Sprint Showcase',
    'Riverside Cup',
    'Green Mile Trial',
    'Imperial Stakes',
    'Delta Classic',
    'Coastal Challenge',
    'Lantern Derby',
    'Seaside Trophy',
    'Highland Open',
    'Island Finale'
  ];
  const todayTimes = [
    [12, 0],
    [13, 30],
    [15, 0],
    [16, 30],
    [18, 0]
  ];
  const futureTimes = [
    [9, 30],
    [14, 0],
    [19, 30]
  ];

  return Array.from({ length: 5 }, function(_, tournamentIndex) {
    const day = addDays(today, tournamentIndex);
    const dateCode = formatDateCode(day);
    const raceSpecs = Array.from({ length: RACE_COUNT_PER_TOURNAMENT }, function(__, raceIndex) {
      const isToday = raceIndex === 0;
      const time = isToday
        ? todayTimes[tournamentIndex]
        : futureTimes[raceIndex];
      const raceDay = isToday
        ? today
        : addDays(today, Math.min(5, tournamentIndex + raceIndex));
      const maxParticipants = 10;
      const prizePool = 45000000 + (tournamentIndex * 9000000) + (raceIndex * 6000000);

      return {
        name: `${themes[tournamentIndex]} Race ${raceIndex + 1}`,
        raceDate: withLocalTime(raceDay, time[0], time[1]),
        distance: 1200 + ((tournamentIndex + raceIndex) % 5) * 200,
        maxParticipants,
        prizePool,
        prizeDistribution: [
          { position: 1, percent: 60, label: 'Winner' },
          { position: 2, percent: 25, label: 'Runner-up' },
          { position: 3, percent: 15, label: 'Third place' }
        ]
      };
    });

    return {
      name: `${BATCH_PREFIX} ${dateCode} ${themes[tournamentIndex]}`,
      description: 'Seeded tournament for same-day demo flows with paid entries, eligible participants, and race-ready checks.',
      location: venues[tournamentIndex],
      image_url: tournamentImages[tournamentIndex % tournamentImages.length],
      start_date: raceSpecs[0].raceDate,
      end_date: raceSpecs[raceSpecs.length - 1].raceDate,
      status: 'active',
      entry_fee: calculateEntryFee(raceSpecs),
      raceSpecs
    };
  });
}

async function createTournamentBundle(spec, tournamentIndex, pool) {
  const tournament = await Tournament.create({
    name: spec.name,
    description: spec.description,
    location: spec.location,
    image_url: spec.image_url,
    start_date: spec.start_date,
    end_date: spec.end_date,
    status: spec.status,
    created_by: pool.adminUserId || (await User.findOne({}).select('_id').lean())._id
  });
  const rounds = await Round.insertMany([
    {
      tournament_id: tournament._id,
      name: 'Opening Heat',
      round_order: 1,
      description: 'First qualification heat for demo-ready participants.',
      status: 'active'
    },
    {
      tournament_id: tournament._id,
      name: 'Second Heat',
      round_order: 2,
      description: 'Second qualification heat for demo-ready participants.',
      status: 'active'
    },
    {
      tournament_id: tournament._id,
      name: 'Feature Final',
      round_order: 3,
      description: 'Final race for the seeded demo tournament.',
      status: 'active'
    }
  ]);

  const raceDocs = [];
  const registrationDocs = [];
  const assignmentDocs = [];
  const horseCheckDocs = [];

  for (let raceIndex = 0; raceIndex < spec.raceSpecs.length; raceIndex += 1) {
    const raceSpec = spec.raceSpecs[raceIndex];
    const referee = pool.referees[(tournamentIndex + raceIndex) % pool.referees.length];
    const race = await Race.create({
      tournament_id: tournament._id,
      round_id: pickRound(rounds, raceIndex)._id,
      name: raceSpec.name,
      race_date: raceSpec.raceDate,
      distance: raceSpec.distance,
      max_participants: raceSpec.maxParticipants,
      location: spec.location,
      referee_id: referee._id,
      venue_code: `D${String(tournamentIndex + 1).padStart(2, '0')}`,
      course: ['B+2', 'A', 'C'][raceIndex],
      race_class: String(5 - Math.min(4, raceIndex)),
      going: ['Good', 'Fast', 'Good To Firm'][raceIndex],
      surface: raceIndex === 2 ? 'Dirt' : 'Turf',
      model_input_version: 1,
      registration_locked: false,
      registration_lock_at: calculateRegistrationLockAt(raceSpec.raceDate),
      status: 'scheduled',
      betting_status: 'unavailable',
      betting_market: {
        status: 'unavailable',
        opens_at: null,
        closes_at: null,
        min_stake: 1,
        max_stake: 1000,
        currency: 'TOKEN'
      },
      prize_pool: raceSpec.prizePool,
      prize_currency: 'VND',
      entry_fee: spec.entry_fee,
      entry_fee_currency: 'VND',
      prize_distribution: raceSpec.prizeDistribution,
      entries_finalized_at: new Date(Date.now() - 60 * 60 * 1000),
      entries_finalized_by: pool.adminUserId
    });
    const horseOffset = ((tournamentIndex * RACE_COUNT_PER_TOURNAMENT + raceIndex) * PARTICIPANTS_PER_RACE) % pool.horses.length;

    raceDocs.push(race);

    for (let participantIndex = 0; participantIndex < PARTICIPANTS_PER_RACE; participantIndex += 1) {
      const horse = pool.horses[(horseOffset + participantIndex) % pool.horses.length];
      const jockey = pool.jockeys[(horseOffset + participantIndex + raceIndex) % pool.jockeys.length];
      const now = new Date();
      const orderId = `REG-TODAY-DEMO-${race._id.toString().slice(-8).toUpperCase()}-${participantIndex + 1}`;
      const registrationStatus = REGISTRATION_STATUS.APPROVED;
      const assignmentStatus = ASSIGNMENT_STATUS.ACCEPTED;
      const hasAssignment = true;
      const assignmentReady = true;
      const gearStart = (tournamentIndex + raceIndex + participantIndex) % HORSE_GEAR_CODES.length;
      const gears = [
        HORSE_GEAR_CODES[gearStart],
        HORSE_GEAR_CODES[(gearStart + 3) % HORSE_GEAR_CODES.length]
      ];

      registrationDocs.push({
        tournament_id: tournament._id,
        race_id: race._id,
        horse_id: horse._id,
        owner_id: horse.owner_id._id,
        horse_no: participantIndex + 1,
        draw: participantIndex + 1,
        rating_snapshot: horse.current_rating || 50,
        gears,
        declared_weight_kg: 54.5 + ((participantIndex + raceIndex) % 4) * 0.5,
        status: registrationStatus,
        note: 'Seeded owner2 entry ready for full-flow demo.',
        admin_note: 'Approved, paid, and finalized for demo readiness.',
        entry_fee_vnd: spec.entry_fee,
        entry_fee_token: 0,
        payment_status: 'paid',
        payment_method: 'VNPAY',
        payment_order_id: orderId,
        gateway_reference_id: `${orderId}-GW`,
        payment_paid_at: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        registered_at: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        approved_by: pool.adminUserId,
        approved_at: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        entry_finalized_at: new Date(now.getTime() - 60 * 60 * 1000),
        entry_finalized_by: pool.adminUserId
      });
      if (hasAssignment) {
        assignmentDocs.push({
        race_id: race._id,
        horse_id: horse._id,
        owner_id: horse.owner_id._id,
        jockey_id: jockey._id,
        assignment_type: ASSIGNMENT_TYPE.PRIMARY,
        status: assignmentStatus,
        invitation_message: `Jockey workflow demo for ${race.name}.`,
        meeting: {
          title: `${horse.name} ${race.name} briefing`,
          meeting_time: new Date(raceSpec.raceDate.getTime() - 5 * 60 * 60 * 1000),
          location_name: spec.location,
          address: spec.location,
          contact_name: 'Demo Race Office',
          contact_phone: '+84 900 000 000',
          note: 'Seeded meeting accepted for demo.',
          accepted_at: assignmentStatus !== ASSIGNMENT_STATUS.MEETING_INVITED
            ? new Date(now.getTime() - 3 * 60 * 60 * 1000)
            : undefined
        },
        terms: {
          agreed_terms: 'Standard race-day fee, safety, and conduct terms accepted.',
          meeting_note: 'Seeded as accepted for immediate demo readiness.',
          agreed_at: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          updated_by: pool.adminUserId
        },
        contract: {
          contract_number: `DEMO-${race._id.toString().slice(-6).toUpperCase()}-${participantIndex + 1}`,
          title: `${horse.name} ${race.name} Primary Jockey Contract`,
          file_url: 'https://example.com/demo-contract.pdf',
          file_type: 'application/pdf',
          file_name: 'demo-contract.pdf',
          signed_at: new Date(now.getTime() - 90 * 60 * 1000),
          uploaded_at: new Date(now.getTime() - 90 * 60 * 1000),
          confirmed_at: new Date(now.getTime() - 80 * 60 * 1000),
          note: 'Seeded accepted contract.'
        },
        invited_at: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        responded_at: new Date(now.getTime() - 3 * 60 * 60 * 1000)
        });
      }
      if (assignmentReady) horseCheckDocs.push({
        race_id: race._id,
        horse_id: horse._id,
        jockey_id: jockey._id,
        referee_id: referee._id,
        phase: HORSE_CHECK_PHASE.PRE_RACE,
        status: HORSE_CHECK_STATUS.PASSED,
        checklist: {
          identity_verified: true,
          tack_checked: true,
          vet_clearance: true,
          lane_ready: true
        },
        issues: [],
        health_status: horse.health_status || 'fit',
        weight: horse.weight || 480,
        check_note: 'Seeded passed pre-race check for demo readiness.',
        is_eligible: true,
        checked_at: new Date(now.getTime() - 60 * 60 * 1000)
      });
    }
  }

  await Registration.insertMany(registrationDocs, { ordered: true });
  await JockeyAssignment.insertMany(assignmentDocs, { ordered: true });
  await HorseCheck.insertMany(horseCheckDocs, { ordered: true });

  return {
    tournament,
    rounds,
    races: raceDocs,
    registrations: registrationDocs,
    assignments: assignmentDocs,
    horse_checks: horseCheckDocs
  };
}

async function seedTodayDemoTournaments() {
  await connectDatabase();

  const today = startOfLocalDay(new Date());
  const cleanup = await cleanupExistingBatch();
  const pool = await loadSeedPool();
  const tournamentSpecs = buildTournamentSpecs(today);
  const bundles = [];

  for (let index = 0; index < tournamentSpecs.length; index += 1) {
    bundles.push(await createTournamentBundle(tournamentSpecs[index], index, pool));
  }

  const summary = bundles.reduce(function(total, bundle) {
    total.tournaments += 1;
    total.rounds += bundle.rounds.length;
    total.races += bundle.races.length;
    total.registrations += bundle.registrations.length;
    total.assignments += bundle.assignments.length;
    total.horse_checks += bundle.horse_checks.length;
    return total;
  }, {
    tournaments: 0,
    rounds: 0,
    races: 0,
    registrations: 0,
    assignments: 0,
    horse_checks: 0
  });

  return {
    cleanup,
    created: summary,
    first_race: bundles[0].races[0] && {
      id: bundles[0].races[0]._id.toString(),
      name: bundles[0].races[0].name,
      race_date: bundles[0].races[0].race_date
    },
    date_window: {
      from: today,
      to: addDays(today, 7)
    }
  };
}

seedTodayDemoTournaments()
  .then(async function(summary) {
    console.log(JSON.stringify(summary, null, 2));
    await mongoose.disconnect();
  })
  .catch(async function(error) {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  });
