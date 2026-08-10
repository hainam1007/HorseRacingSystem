require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const {
  Bet,
  DepositPackage,
  DepositRequest,
  Horse,
  HorseCheck,
  HorseOwner,
  HorseRatingHistory,
  Jockey,
  JockeyAssignment,
  Notification,
  Prize,
  PrizeAward,
  RaceEngineRun,
  RaceOddsMarket,
  RaceRun,
  Race,
  RaceReferee,
  RaceResult,
  RefereeReport,
  Registration,
  RegistrationCancellationTicket,
  RewardItem,
  Role,
  RoleApplication,
  Round,
  Tournament,
  User,
  UserRole,
  Violation,
  Wallet,
  TransactionHistory,
  RedemptionHistory
} = require('../models');

const PASSWORD = 'Password123';
const DEMO_NOW = process.env.DEMO_SEED_NOW ? new Date(process.env.DEMO_SEED_NOW) : new Date();
const BASE_DATE = startOfLocalDay(DEMO_NOW);
const REALTIME_DEMO_RACE_COUNT = 6;
const TOMORROW_DEMO_RACE_COUNT = 6;

const horseImages = [
  'https://i.pinimg.com/736x/16/b4/e0/16b4e0814c679b1a64548914e499497d.jpg',
  'https://i.pinimg.com/736x/28/b6/ab/28b6ab0f95a9f5945b17ba17a3800ae8.jpg',
  'https://i.pinimg.com/736x/94/98/ab/9498ab5a8136f433c8d716fec64a7556.jpg',
  'https://i.pinimg.com/1200x/0b/9c/f0/0b9cf065f5a0823c9870113e206bfbd6.jpg',
  'https://i.pinimg.com/1200x/6f/ea/04/6fea0472d1ae0803ed68af98e0a4fd3f.jpg',
  'https://i.pinimg.com/736x/8b/90/1f/8b901f83ec35fb5cbc5f516570c12ca4.jpg'
];

const avatarImages = [
  'https://i.pinimg.com/1200x/e2/9b/73/e29b73519a7852c8cb9c33565dc89ac7.jpg',
  'https://i.pinimg.com/236x/bb/d3/c2/bbd3c26709d6837911ff67212f5bef3b.jpg',
  'https://i.pinimg.com/1200x/fe/26/7b/fe267b6f716f89ba262e451ba1331633.jpg',
  'https://i.pinimg.com/1200x/81/ad/28/81ad28872a4be66c032618e1ae2ec9e3.jpg',
  'https://i.pinimg.com/736x/85/96/58/85965865565fbff16d1327b6610f3560.jpg',
  'https://i.pinimg.com/736x/a8/18/1c/a8181cc7049b30f6b80a2e4066af6602.jpg'
];

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

const roleDescriptions = {
  admin: 'System administrator',
  horse_owner: 'Horse owner and stable manager',
  jockey: 'Professional jockey',
  race_referee: 'Race referee',
  spectator: 'Spectator account'
};

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function startOfLocalDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(days, hour = 9, minute = 0) {
  const date = new Date(BASE_DATE);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function addMinutesFromNow(minutes) {
  return new Date(DEMO_NOW.getTime() + (minutes * 60 * 1000));
}

function calculateRegistrationLockAt(raceDate) {
  return new Date(new Date(raceDate).getTime() - (3 * 60 * 60 * 1000));
}

function bettingMarket(status, opensAt, closesAt) {
  return {
    betting_status: status,
    betting_closes_at: closesAt,
    betting_market: {
      status,
      opens_at: opensAt,
      closes_at: closesAt,
      min_stake: 50,
      max_stake: 500,
      currency: 'points'
    }
  };
}

function buildSeedBet(data) {
  const stakeAmount = data.stake_amount || 100;
  const winPayout = Number(data.payout_amount || 0);
  const gameOdds = data.game_odds || (winPayout > 0 ? winPayout / stakeAmount : 3);
  const potentialPayout = Math.round(stakeAmount * gameOdds * 100) / 100;
  const payoutAmount = data.status === 'won' ? (winPayout || potentialPayout) : 0;

  return Object.assign({}, data, {
    stake_amount: stakeAmount,
    odds_snapshot: Object.assign({
      model_name: 'seed_demo_fixed_odds',
      model_version: 'seed_v1',
      generated_at: data.submitted_at || BASE_DATE,
      payout_factor: 0.85,
      horse_name: data.seed_horse_name || 'Seeded Horse',
      win_probability: 0.25,
      fair_odds: 4,
      game_odds: gameOdds,
      probability_rank: 1
    }, data.odds_snapshot || {}),
    potential_payout: potentialPayout,
    payout_amount: payoutAmount
  });
}

function getBulkRacePrizePool(tournamentIndex, raceIndex) {
  const baseByRace = [45000000, 55000000, 110000000];
  const tournamentStep = (tournamentIndex % 5) * 5000000;
  const finalBonus = raceIndex === 2 ? Math.floor(tournamentIndex / 5) * 10000000 : 0;

  return baseByRace[raceIndex] + tournamentStep + finalBonus;
}

async function resetFullDatabase() {
  const collections = [
    Notification,
    Bet,
    DepositRequest,
    DepositPackage,
    TransactionHistory,
    Wallet,
    RedemptionHistory,
    RewardItem,
    PrizeAward,
    Prize,
    RefereeReport,
    Violation,
    HorseCheck,
    RaceResult,
    RaceEngineRun,
    RaceRun,
    RaceOddsMarket,
    JockeyAssignment,
    Registration,
    RegistrationCancellationTicket,
    RoleApplication,
    Race,
    Round,
    Tournament,
    HorseRatingHistory,
    Horse,
    RaceReferee,
    Jockey,
    HorseOwner,
    UserRole,
    User,
    Role
  ];

  for (const model of collections) {
    await model.deleteMany({});
  }
}

async function createRoles() {
  const roles = {};
  for (const roleName of Object.keys(roleDescriptions)) {
    roles[roleName] = await Role.create({
      role_name: roleName,
      description: roleDescriptions[roleName]
    });
  }
  return roles;
}

async function createUser({ email, fullName, roleName, roles, avatarUrl, phone }) {
  const password = await bcrypt.hash(PASSWORD, 10);
  const user = await User.create({
    full_name: fullName,
    email,
    password,
    phone_number: phone,
    avatar_url: avatarUrl,
    status: 'active',
    email_verified: true,
    email_verified_at: new Date(),
    password_changed_at: new Date()
  });

  await UserRole.create({
    user_id: user._id,
    role_id: roles[roleName]._id
  });

  return user;
}

async function seedUsersAndProfiles(roles) {
  const users = {};

  users.admin = await createUser({
    email: 'admin@racing.test',
    fullName: 'Admin Racing',
    roleName: 'admin',
    roles,
    avatarUrl: avatarImages[0],
    phone: '+840900000001'
  });
  users.owner1 = await createUser({
    email: 'owner1@racing.test',
    fullName: 'Owner Stable One',
    roleName: 'horse_owner',
    roles,
    avatarUrl: avatarImages[1],
    phone: '+840900000011'
  });
  users.owner2 = await createUser({
    email: 'owner2@racing.test',
    fullName: 'Owner Stable Two',
    roleName: 'horse_owner',
    roles,
    avatarUrl: avatarImages[2],
    phone: '+840900000012'
  });
  users.jockey1 = await createUser({
    email: 'jockey1@racing.test',
    fullName: 'Jockey Alpha',
    roleName: 'jockey',
    roles,
    avatarUrl: avatarImages[0],
    phone: '+840900000021'
  });
  users.jockey2 = await createUser({
    email: 'jockey2@racing.test',
    fullName: 'Jockey Bravo',
    roleName: 'jockey',
    roles,
    avatarUrl: avatarImages[3],
    phone: '+840900000022'
  });
  users.jockey3 = await createUser({
    email: 'jockey3@racing.test',
    fullName: 'Jockey Charlie',
    roleName: 'jockey',
    roles,
    avatarUrl: avatarImages[4],
    phone: '+840900000023'
  });
  users.jockey4 = await createUser({
    email: 'jockey4@racing.test',
    fullName: 'Jockey Delta',
    roleName: 'jockey',
    roles,
    avatarUrl: avatarImages[5],
    phone: '+840900000024'
  });
  users.referee1 = await createUser({
    email: 'referee1@racing.test',
    fullName: 'Referee One',
    roleName: 'race_referee',
    roles,
    avatarUrl: avatarImages[2],
    phone: '+840900000031'
  });
  users.referee2 = await createUser({
    email: 'referee2@racing.test',
    fullName: 'Referee Two',
    roleName: 'race_referee',
    roles,
    avatarUrl: avatarImages[3],
    phone: '+840900000032'
  });
  users.spectator1 = await createUser({
    email: 'spectator1@racing.test',
    fullName: 'Spectator One',
    roleName: 'spectator',
    roles,
    avatarUrl: avatarImages[4],
    phone: '+840900000041'
  });
  users.spectator2 = await createUser({
    email: 'spectator2@racing.test',
    fullName: 'Spectator Two',
    roleName: 'spectator',
    roles,
    avatarUrl: avatarImages[5],
    phone: '+840900000042'
  });

  const ownerProfiles = {
    owner1: await HorseOwner.create({
      user_id: users.owner1._id,
      stable_name: 'Atlas Stable',
      address: 'District 7, Ho Chi Minh City',
      license_number: 'OWN-001',
      status: 'active'
    }),
    owner2: await HorseOwner.create({
      user_id: users.owner2._id,
      stable_name: 'Rivergate Stable',
      address: 'Thu Duc, Ho Chi Minh City',
      license_number: 'OWN-002',
      status: 'active'
    })
  };

  const jockeyProfiles = {
    jockey1: await Jockey.create({
      user_id: users.jockey1._id,
      height: 165,
      weight: 52,
      experience_years: 6,
      license_number: 'JCK-001',
      total_races: 48,
      total_wins: 14,
      status: 'active'
    }),
    jockey2: await Jockey.create({
      user_id: users.jockey2._id,
      height: 168,
      weight: 54,
      experience_years: 5,
      license_number: 'JCK-002',
      total_races: 35,
      total_wins: 9,
      status: 'active'
    }),
    jockey3: await Jockey.create({
      user_id: users.jockey3._id,
      height: 170,
      weight: 55,
      experience_years: 8,
      license_number: 'JCK-003',
      total_races: 72,
      total_wins: 23,
      status: 'active'
    }),
    jockey4: await Jockey.create({
      user_id: users.jockey4._id,
      height: 166,
      weight: 53,
      experience_years: 4,
      license_number: 'JCK-004',
      total_races: 28,
      total_wins: 6,
      status: 'active'
    })
  };

  const refereeProfiles = {
    referee1: await RaceReferee.create({
      user_id: users.referee1._id,
      license_number: 'REF-001',
      experience_years: 9,
      status: 'active'
    }),
    referee2: await RaceReferee.create({
      user_id: users.referee2._id,
      license_number: 'REF-002',
      experience_years: 5,
      status: 'active'
    })
  };

  return { users, ownerProfiles, jockeyProfiles, refereeProfiles };
}

async function seedRaceDomain({ users, ownerProfiles, refereeProfiles }) {
  const springCup = await Tournament.create({
    name: 'Spring Cup 2026',
    description: 'Main demo tournament for owner registration and jockey invitation flows.',
    location: 'Saigon Racecourse',
    start_date: addDays(14),
    end_date: addDays(18),
    status: 'active',
    created_by: users.admin._id
  });

  const derbyTrial = await Tournament.create({
    name: 'Derby Trial 2026',
    description: 'Demo tournament for referee, result, prize, and spectator flows.',
    location: 'Da Nang Turf Club',
    start_date: addDays(21),
    end_date: addDays(25),
    status: 'active',
    created_by: users.admin._id
  });

  const springQualifier = await Round.create({
    tournament_id: springCup._id,
    name: 'Qualifier',
    round_order: 1,
    description: 'Spring Cup opening heats.',
    status: 'active'
  });
  const springFinalRound = await Round.create({
    tournament_id: springCup._id,
    name: 'Final',
    round_order: 2,
    description: 'Spring Cup final race.',
    status: 'scheduled'
  });
  const derbyQualifier = await Round.create({
    tournament_id: derbyTrial._id,
    name: 'Qualifier',
    round_order: 1,
    description: 'Derby qualification heat.',
    status: 'active'
  });
  const derbyFinalRound = await Round.create({
    tournament_id: derbyTrial._id,
    name: 'Final',
    round_order: 2,
    description: 'Derby final event.',
    status: 'completed'
  });

  const races = {
    springHeat1: await Race.create({
      tournament_id: springCup._id,
      round_id: springQualifier._id,
      name: 'Spring Heat 1',
      race_date: addDays(15, 8),
      distance: 1200,
      max_participants: 8,
      prize_pool: 40000000,
      prize_currency: 'VND',
      location: 'Saigon Racecourse',
      referee_id: refereeProfiles.referee1._id,
      status: 'scheduled'
    }),
    springHeat2: await Race.create({
      tournament_id: springCup._id,
      round_id: springQualifier._id,
      name: 'Spring Heat 2',
      race_date: addDays(15, 11),
      distance: 1200,
      max_participants: 8,
      prize_pool: 40000000,
      prize_currency: 'VND',
      location: 'Saigon Racecourse',
      referee_id: refereeProfiles.referee1._id,
      status: 'scheduled'
    }),
    springFinal: await Race.create({
      tournament_id: springCup._id,
      round_id: springFinalRound._id,
      name: 'Spring Final',
      race_date: addDays(18, 15),
      distance: 1600,
      max_participants: 10,
      prize_pool: 90000000,
      prize_currency: 'VND',
      location: 'Saigon Racecourse',
      referee_id: refereeProfiles.referee2._id,
      status: 'scheduled'
    }),
    derbyHeat1: await Race.create({
      tournament_id: derbyTrial._id,
      round_id: derbyQualifier._id,
      name: 'Derby Heat 1',
      race_date: addDays(22, 9),
      distance: 1400,
      max_participants: 8,
      prize_pool: 35000000,
      prize_currency: 'VND',
      location: 'Da Nang Turf Club',
      referee_id: refereeProfiles.referee1._id,
      status: 'scheduled'
    }),
    derbyHeat2: await Race.create({
      tournament_id: derbyTrial._id,
      round_id: derbyQualifier._id,
      name: 'Derby Heat 2',
      race_date: addDays(22, 12),
      distance: 1400,
      max_participants: 8,
      prize_pool: 35000000,
      prize_currency: 'VND',
      location: 'Da Nang Turf Club',
      referee_id: refereeProfiles.referee2._id,
      status: 'scheduled'
    }),
    derbyFinal: await Race.create({
      tournament_id: derbyTrial._id,
      round_id: derbyFinalRound._id,
      name: 'Derby Final',
      race_date: addDays(-2, 15),
      distance: 1800,
      max_participants: 10,
      prize_pool: 80000000,
      prize_currency: 'VND',
      location: 'Da Nang Turf Club',
      referee_id: refereeProfiles.referee1._id,
      status: 'completed'
    })
  };

  await Promise.all([
    Race.updateMany(
      { tournament_id: springCup._id },
      { $set: { entry_fee: 26000000, entry_fee_currency: 'VND' } }
    ),
    Race.updateMany(
      { tournament_id: derbyTrial._id },
      { $set: { entry_fee: 18000000, entry_fee_currency: 'VND' } }
    )
  ]);

  const horses = {
    thunderBolt: await Horse.create({
      owner_id: ownerProfiles.owner1._id,
      name: 'Thunder Bolt',
      breed: 'Thoroughbred',
      gender: 'male',
      date_of_birth: new Date('2020-03-14T00:00:00.000Z'),
      color: 'Bay',
      weight: 486,
      health_status: 'Cleared for scheduled race preparation.',
      registration_number: 'HR-THUNDER-001',
      image_url: horseImages[0],
      status: 'active'
    }),
    silverWind: await Horse.create({
      owner_id: ownerProfiles.owner1._id,
      name: 'Silver Wind',
      breed: 'Arabian',
      gender: 'female',
      date_of_birth: new Date('2019-06-02T00:00:00.000Z'),
      color: 'Grey',
      weight: 462,
      health_status: 'Fit. Needs routine warmup check.',
      registration_number: 'HR-SILVER-002',
      image_url: horseImages[1],
      status: 'active'
    }),
    nightArrow: await Horse.create({
      owner_id: ownerProfiles.owner1._id,
      name: 'Night Arrow',
      breed: 'Thoroughbred',
      gender: 'male',
      date_of_birth: new Date('2021-01-20T00:00:00.000Z'),
      color: 'Black',
      weight: 474,
      health_status: 'Pending admin race eligibility review.',
      registration_number: 'HR-NIGHT-003',
      image_url: horseImages[2],
      status: 'active'
    }),
    emberCrown: await Horse.create({
      owner_id: ownerProfiles.owner1._id,
      name: 'Ember Crown',
      breed: 'Quarter Horse',
      gender: 'female',
      date_of_birth: new Date('2020-11-11T00:00:00.000Z'),
      color: 'Chestnut',
      weight: 455,
      health_status: 'Requires updated medical certificate.',
      registration_number: 'HR-EMBER-004',
      image_url: horseImages[3],
      status: 'active'
    }),
    riverFlash: await Horse.create({
      owner_id: ownerProfiles.owner2._id,
      name: 'River Flash',
      breed: 'Thoroughbred',
      gender: 'male',
      date_of_birth: new Date('2018-09-10T00:00:00.000Z'),
      color: 'Bay',
      weight: 492,
      health_status: 'Race-day check passed.',
      registration_number: 'HR-RIVER-005',
      image_url: horseImages[4],
      status: 'active'
    }),
    goldenMane: await Horse.create({
      owner_id: ownerProfiles.owner2._id,
      name: 'Golden Mane',
      breed: 'Arabian',
      gender: 'female',
      date_of_birth: new Date('2019-05-18T00:00:00.000Z'),
      color: 'Palomino',
      weight: 468,
      health_status: 'Winner profile. Eligible and verified.',
      registration_number: 'HR-GOLDEN-006',
      image_url: horseImages[5],
      status: 'active'
    })
  };

  return { tournaments: { springCup, derbyTrial }, races, horses };
}

async function seedRegistrations({ users, ownerProfiles, races, horses, tournaments }) {
  const approvedAt = addDays(-1, 10);
  return {
    thunderSpringHeat1: await Registration.create({
      tournament_id: tournaments.springCup._id,
      race_id: races.springHeat1._id,
      horse_id: horses.thunderBolt._id,
      owner_id: ownerProfiles.owner1._id,
      status: 'approved',
      note: 'Owner wants this horse ready for first heat.',
      admin_note: 'Eligible for Spring Heat 1.',
      registered_at: addDays(-7, 9),
      approved_by: users.admin._id,
      approved_at: approvedAt
    }),
    silverSpringHeat2: await Registration.create({
      tournament_id: tournaments.springCup._id,
      race_id: races.springHeat2._id,
      horse_id: horses.silverWind._id,
      owner_id: ownerProfiles.owner1._id,
      status: 'approved',
      note: 'Second heat entry.',
      admin_note: 'Approved with routine check.',
      registered_at: addDays(-6, 9),
      approved_by: users.admin._id,
      approved_at: approvedAt
    }),
    nightSpringFinal: await Registration.create({
      tournament_id: tournaments.springCup._id,
      race_id: races.springFinal._id,
      horse_id: horses.nightArrow._id,
      owner_id: ownerProfiles.owner1._id,
      status: 'pending',
      note: 'Awaiting admin review for final race.',
      registered_at: addDays(-1, 14)
    }),
    emberSpringFinal: await Registration.create({
      tournament_id: tournaments.springCup._id,
      race_id: races.springFinal._id,
      horse_id: horses.emberCrown._id,
      owner_id: ownerProfiles.owner1._id,
      status: 'rejected',
      note: 'Owner requested final entry.',
      admin_note: 'Medical certificate is outdated.',
      registered_at: addDays(-5, 10),
      approved_by: users.admin._id,
      approved_at: addDays(-4, 10)
    }),
    riverDerbyHeat1: await Registration.create({
      tournament_id: tournaments.derbyTrial._id,
      race_id: races.derbyHeat1._id,
      horse_id: horses.riverFlash._id,
      owner_id: ownerProfiles.owner2._id,
      status: 'approved',
      note: 'Race referee flow entry.',
      admin_note: 'Approved for referee check demo.',
      registered_at: addDays(-8, 11),
      approved_by: users.admin._id,
      approved_at: addDays(-7, 11)
    }),
    goldenDerbyFinal: await Registration.create({
      tournament_id: tournaments.derbyTrial._id,
      race_id: races.derbyFinal._id,
      horse_id: horses.goldenMane._id,
      owner_id: ownerProfiles.owner2._id,
      status: 'approved',
      note: 'Published result demo entry.',
      admin_note: 'Approved for final.',
      registered_at: addDays(-12, 8),
      approved_by: users.admin._id,
      approved_at: addDays(-11, 9)
    })
  };
}

async function seedAssignments({ ownerProfiles, jockeyProfiles, races, horses, users }) {
  return {
    silverInvitation: await JockeyAssignment.create({
      race_id: races.springHeat2._id,
      horse_id: horses.silverWind._id,
      owner_id: ownerProfiles.owner1._id,
      jockey_id: jockeyProfiles.jockey2._id,
      status: 'meeting_invited',
      invitation_message: 'Please review the Spring Heat 2 ride and join the briefing.',
      meeting: {
        title: 'Silver Wind Spring Heat 2 Briefing',
        meeting_url: 'https://meet.google.com/sil-wind-heat',
        meeting_time: addDays(3, 9),
        note: 'Discuss race plan and stable expectations.'
      },
      invited_at: addDays(-1, 9)
    }),
    riverAccepted: await JockeyAssignment.create({
      race_id: races.derbyHeat1._id,
      horse_id: horses.riverFlash._id,
      owner_id: ownerProfiles.owner2._id,
      jockey_id: jockeyProfiles.jockey3._id,
      status: 'accepted',
      invitation_message: 'Confirmed assignment for Derby Heat 1.',
      meeting: {
        title: 'River Flash Derby Heat 1 Briefing',
        meeting_url: 'https://meet.google.com/river-flash-derby',
        meeting_time: addDays(-3, 10),
        note: 'Pre-race strategy complete.',
        accepted_at: addDays(-3, 11),
        response_message: 'Accepted and ready.'
      },
      terms: {
        agreed_terms: 'Standard race-day fee and safety terms accepted.',
        meeting_note: 'Owner and jockey aligned on race plan.',
        agreed_at: addDays(-2, 10),
        updated_by: users.owner2._id
      },
      contract: {
        contract_number: 'CTR-RIVER-001',
        title: 'River Flash Derby Heat Agreement',
        file_url: 'https://example.com/contracts/river-flash-derby.pdf',
        file_type: 'application/pdf',
        file_name: 'river-flash-derby.pdf',
        uploaded_at: addDays(-2, 12),
        confirmed_at: addDays(-2, 13),
        note: 'Confirmed by jockey.'
      },
      invited_at: addDays(-4, 9),
      responded_at: addDays(-3, 11)
    }),
    goldenContract: await JockeyAssignment.create({
      race_id: races.derbyFinal._id,
      horse_id: horses.goldenMane._id,
      owner_id: ownerProfiles.owner2._id,
      jockey_id: jockeyProfiles.jockey4._id,
      status: 'contract_uploaded',
      invitation_message: 'Please review Derby Final contract terms.',
      meeting: {
        title: 'Golden Mane Derby Final Briefing',
        meeting_url: 'https://meet.google.com/golden-mane-final',
        meeting_time: addDays(-5, 9),
        note: 'Final briefing completed.',
        accepted_at: addDays(-5, 10),
        response_message: 'Meeting accepted.'
      },
      terms: {
        agreed_terms: 'Final race bonus and media obligations included.',
        meeting_note: 'Contract ready for jockey confirmation.',
        agreed_at: addDays(-4, 10),
        updated_by: users.owner2._id
      },
      contract: {
        contract_number: 'CTR-GOLDEN-001',
        title: 'Golden Mane Derby Final Agreement',
        file_url: 'https://example.com/contracts/golden-mane-final.pdf',
        file_type: 'application/pdf',
        file_name: 'golden-mane-final.pdf',
        uploaded_at: addDays(-4, 12),
        note: 'Waiting for jockey confirmation.'
      },
      invited_at: addDays(-6, 9),
      responded_at: addDays(-5, 10)
    })
  };
}

async function seedRefereeAndResults({ users, refereeProfiles, jockeyProfiles, races, horses, ownerProfiles }) {
  const riverCheck = await HorseCheck.create({
    race_id: races.derbyHeat1._id,
    horse_id: horses.riverFlash._id,
    jockey_id: jockeyProfiles.jockey3._id,
    referee_id: refereeProfiles.referee1._id,
    phase: 'pre_race',
    status: 'passed',
    checklist: { gait: true, tack: true, documents: true },
    health_status: 'Fit for race.',
    weight: 492,
    check_note: 'All race-day checks passed.',
    is_eligible: true,
    checked_at: addDays(-1, 8)
  });

  const goldenCheck = await HorseCheck.create({
    race_id: races.derbyFinal._id,
    horse_id: horses.goldenMane._id,
    jockey_id: jockeyProfiles.jockey4._id,
    referee_id: refereeProfiles.referee1._id,
    phase: 'post_race',
    status: 'minor_issue',
    checklist: { gait: true, tack: true, documents: true },
    issues: [{ code: 'LATE_COOLDOWN', severity: 'low', note: 'Cooldown delayed after finish.' }],
    event_type: 'post_race_review',
    severity: 'low',
    time_marker: 'after finish',
    description: 'Minor post-race cooldown delay recorded.',
    requires_violation: true,
    health_status: 'Stable after post-race review.',
    weight: 468,
    check_note: 'Minor issue recorded for audit.',
    is_eligible: true,
    checked_at: addDays(-2, 16)
  });

  const violation = await Violation.create({
    race_id: races.derbyFinal._id,
    horse_id: horses.goldenMane._id,
    jockey_id: jockeyProfiles.jockey4._id,
    referee_id: refereeProfiles.referee1._id,
    horse_check_id: goldenCheck._id,
    violation_type: 'track_safety_issue',
    description: 'Cooldown was delayed after the final race.',
    severity: 'minor',
    time_marker: 'post-race',
    evidence_urls: [],
    decision: 'warning',
    penalty: {
      type: 'warning',
      note: 'No points penalty'
    },
    status: 'resolved',
    created_at: addDays(-2, 16)
  });

  goldenCheck.linked_violation_id = violation._id;
  await goldenCheck.save();

  await RefereeReport.create({
    race_id: races.derbyHeat1._id,
    referee_id: refereeProfiles.referee1._id,
    report_title: 'Derby Heat 1 Pre-Race Report',
    report_content: 'Pre-race checks completed. Track is ready.',
    race_condition: 'normal',
    weather: 'Clear',
    track_condition: 'Fast',
    conclusion: 'Race can proceed.',
    status: 'draft',
    created_at: addDays(-1, 8)
  });

  await RefereeReport.create({
    race_id: races.derbyFinal._id,
    referee_id: refereeProfiles.referee1._id,
    report_title: 'Derby Final Official Report',
    report_content: 'Race completed and results recorded.',
    race_condition: 'normal',
    weather: 'Dry',
    track_condition: 'Good',
    conclusion: 'Results ready for publication.',
    status: 'submitted',
    created_at: addDays(-2, 16),
    submitted_at: addDays(-2, 17)
  });

  const goldenResult = await RaceResult.create({
    race_id: races.derbyFinal._id,
    horse_id: horses.goldenMane._id,
    jockey_id: jockeyProfiles.jockey4._id,
    position: 1,
    finish_time: 108.42,
    score: 100,
    status: 'published',
    note: 'Clean winning run.',
    recorded_by: refereeProfiles.referee1._id,
    recorded_at: addDays(-2, 16),
    confirmed_by: users.admin._id,
    confirmed_at: addDays(-2, 17),
    published_at: addDays(-2, 18)
  });

  const riverResult = await RaceResult.create({
    race_id: races.derbyFinal._id,
    horse_id: horses.riverFlash._id,
    jockey_id: jockeyProfiles.jockey3._id,
    position: 2,
    finish_time: 110.18,
    score: 80,
    status: 'published',
    note: 'Strong second place.',
    recorded_by: refereeProfiles.referee1._id,
    recorded_at: addDays(-2, 16),
    confirmed_by: users.admin._id,
    confirmed_at: addDays(-2, 17),
    published_at: addDays(-2, 18)
  });

  const firstPrize = await Prize.create({
    tournament_id: races.derbyFinal.tournament_id,
    race_id: races.derbyFinal._id,
    prize_name: 'Derby Final Winner',
    position: 1,
    amount: 15000,
    description: 'Top prize for Derby Final winner.'
  });

  const secondPrize = await Prize.create({
    tournament_id: races.derbyFinal.tournament_id,
    race_id: races.derbyFinal._id,
    prize_name: 'Derby Final Runner Up',
    position: 2,
    amount: 8000,
    description: 'Second-place prize for Derby Final.'
  });

  await PrizeAward.create({
    prize_id: firstPrize._id,
    race_result_id: goldenResult._id,
    horse_id: horses.goldenMane._id,
    owner_id: ownerProfiles.owner2._id,
    amount: 15000,
    status: 'awarded',
    awarded_at: addDays(-1, 10)
  });

  await PrizeAward.create({
    prize_id: secondPrize._id,
    race_result_id: riverResult._id,
    horse_id: horses.riverFlash._id,
    owner_id: ownerProfiles.owner2._id,
    amount: 8000,
    status: 'awarded',
    awarded_at: addDays(-1, 10)
  });

  return { riverCheck, goldenCheck, goldenResult, riverResult };
}

async function seedSpectatorAndNotifications({ users, races, horses }) {
  await Bet.create(buildSeedBet({
    spectator_id: users.spectator1._id,
    race_id: races.derbyFinal._id,
    predicted_horse_id: horses.goldenMane._id,
    status: 'won',
    payout_amount: 350,
    submitted_at: addDays(-3, 12),
    checked_at: addDays(-2, 18),
    seed_horse_name: 'Golden Mane'
  }));

  await Bet.create(buildSeedBet({
    spectator_id: users.spectator2._id,
    race_id: races.derbyFinal._id,
    predicted_horse_id: horses.riverFlash._id,
    status: 'lost',
    payout_amount: 0,
    submitted_at: addDays(-3, 12),
    checked_at: addDays(-2, 18),
    seed_horse_name: 'River Flash'
  }));

  await Notification.insertMany([
    {
      user_id: users.owner1._id,
      title: 'Race registration approved',
      content: 'Thunder Bolt is approved for Spring Heat 1. You can invite a jockey now.',
      type: 'registration',
      is_read: false,
      created_at: addDays(-1, 10)
    },
    {
      user_id: users.jockey2._id,
      title: 'New jockey invitation',
      content: 'Silver Wind has invited you for Spring Heat 2.',
      type: 'jockey_assignment',
      is_read: false,
      created_at: addDays(-1, 9)
    },
    {
      user_id: users.spectator1._id,
      title: 'Prediction won',
      content: 'Your Golden Mane prediction won the Derby Final.',
      type: 'bet',
      is_read: false,
      created_at: addDays(-2, 18)
    }
  ]);
}

async function seedPaymentDashboardData({ users }) {
  const packages = await DepositPackage.insertMany([
    {
      package_id: 'PKG_10K',
      label: 'Starter 10K',
      vnd_price: 10000,
      token_received: 10,
      bonus_token: 0,
      is_active: true
    },
    {
      package_id: 'PKG_50K',
      label: 'Race Day 50K',
      vnd_price: 50000,
      token_received: 50,
      bonus_token: 5,
      is_active: true
    },
    {
      package_id: 'PKG_100K',
      label: 'Grandstand 100K',
      vnd_price: 100000,
      token_received: 100,
      bonus_token: 15,
      is_active: true
    }
  ]);
  const packageMap = new Map(packages.map((item) => [item.package_id, item]));
  const requests = [
    {
      order_id: 'DEMO-JULY-DEP-001',
      user_id: users.spectator1._id,
      package_id: 'PKG_100K',
      total_vnd: 100000,
      total_token: 115,
      payment_method: 'VNPAY',
      status: 'success',
      gateway_reference_id: 'DEMO-JULY-GW-001',
      note: 'Successful July demo top-up.',
      created_at: addDays(-20, 10)
    },
    {
      order_id: 'DEMO-JULY-DEP-002',
      user_id: users.spectator2._id,
      package_id: 'PKG_50K',
      total_vnd: 50000,
      total_token: 55,
      payment_method: 'MOMO',
      status: 'success',
      gateway_reference_id: 'DEMO-JULY-GW-002',
      note: 'Successful July demo top-up.',
      created_at: addDays(-13, 14)
    },
    {
      order_id: 'DEMO-JULY-DEP-003',
      user_id: users.spectator1._id,
      package_id: 'PKG_50K',
      total_vnd: 50000,
      total_token: 55,
      payment_method: 'VNPAY',
      status: 'success',
      gateway_reference_id: 'DEMO-JULY-GW-003',
      note: 'Successful July demo top-up.',
      created_at: addDays(-6, 16)
    },
    {
      order_id: 'DEMO-JULY-DEP-004',
      user_id: users.spectator2._id,
      package_id: 'PKG_10K',
      total_vnd: 10000,
      total_token: 10,
      payment_method: 'VNPAY',
      status: 'pending',
      note: 'Pending payment retained for admin queue demo.',
      created_at: addDays(-1, 11)
    },
    {
      order_id: 'DEMO-JULY-DEP-005',
      user_id: users.spectator1._id,
      package_id: packageMap.get('PKG_10K').package_id,
      total_vnd: 10000,
      total_token: 10,
      payment_method: 'MOMO',
      status: 'failed',
      gateway_reference_id: 'DEMO-JULY-GW-005',
      note: 'Failed payment retained for dashboard coverage.',
      created_at: addDays(-3, 9)
    }
  ];

  await DepositRequest.insertMany(requests);
}

async function seedRoleApplications({ users }) {
  await RoleApplication.insertMany([
    {
      user_id: users.spectator1._id,
      requested_role: 'horse_owner',
      status: 'pending',
      application_data: {
        stable_name: 'Spectator Upgrade Stable',
        ownership_type: 'individual'
      },
      documents: [{ type: 'license', url: 'https://example.com/docs/spectator-owner-license.pdf', note: 'Demo pending document' }]
    },
    {
      user_id: users.spectator2._id,
      requested_role: 'jockey',
      status: 'approved',
      application_data: {
        license_number: 'JCK-UPGRADE-002',
        accreditation_body: 'Demo Racing Board'
      },
      admin_note: 'Approved demo application.',
      reviewed_by: users.admin._id,
      reviewed_at: addDays(-2, 9)
    }
  ]);
}

async function seedExpandedDemoData({ users, ownerProfiles, jockeyProfiles, refereeProfiles }) {
  const autumnSprint = await Tournament.create({
    name: 'Autumn Sprint 2026',
    description: 'Expanded demo tournament for richer owner and spectator dashboards.',
    location: 'Hanoi Autumn Track',
    start_date: addDays(32),
    end_date: addDays(35),
    status: 'active',
    created_by: users.admin._id
  });
  const coastalDerby = await Tournament.create({
    name: 'Coastal Derby 2026',
    description: 'Expanded demo tournament with pending, approved, and completed race states.',
    location: 'Nha Trang Coastal Track',
    start_date: addDays(41),
    end_date: addDays(44),
    status: 'active',
    created_by: users.admin._id
  });
  const nightTrack = await Tournament.create({
    name: 'Night Track Series 2026',
    description: 'Evening race series for schedule, result, and referee scenarios.',
    location: 'Can Tho Night Arena',
    start_date: addDays(50),
    end_date: addDays(53),
    status: 'scheduled',
    created_by: users.admin._id
  });

  const autumnQualifier = await Round.create({
    tournament_id: autumnSprint._id,
    name: 'Qualifier',
    round_order: 1,
    description: 'Autumn opening races.',
    status: 'active'
  });
  const autumnFinal = await Round.create({
    tournament_id: autumnSprint._id,
    name: 'Final',
    round_order: 2,
    description: 'Autumn trophy round.',
    status: 'completed'
  });
  const coastalQualifier = await Round.create({
    tournament_id: coastalDerby._id,
    name: 'Qualifier',
    round_order: 1,
    description: 'Coastal qualification races.',
    status: 'active'
  });
  const coastalFinalRound = await Round.create({
    tournament_id: coastalDerby._id,
    name: 'Final',
    round_order: 2,
    description: 'Coastal derby final.',
    status: 'completed'
  });
  const nightQualifier = await Round.create({
    tournament_id: nightTrack._id,
    name: 'Qualifier',
    round_order: 1,
    description: 'Night track opening races.',
    status: 'active'
  });
  const nightFinalRound = await Round.create({
    tournament_id: nightTrack._id,
    name: 'Final',
    round_order: 2,
    description: 'Night track final.',
    status: 'completed'
  });

  const races = {
    autumnOpener: await Race.create({
      tournament_id: autumnSprint._id,
      round_id: autumnQualifier._id,
      name: 'Autumn Opener',
      race_date: addDays(32, 9),
      distance: 1100,
      max_participants: 8,
      prize_pool: 30000000,
      prize_currency: 'VND',
      location: 'Hanoi Autumn Track',
      referee_id: refereeProfiles.referee2._id,
      status: 'scheduled'
    }),
    autumnDash: await Race.create({
      tournament_id: autumnSprint._id,
      round_id: autumnQualifier._id,
      name: 'Autumn Dash',
      race_date: addDays(33, 10),
      distance: 1300,
      max_participants: 8,
      prize_pool: 45000000,
      prize_currency: 'VND',
      location: 'Hanoi Autumn Track',
      referee_id: refereeProfiles.referee2._id,
      status: 'running'
    }),
    autumnTrophy: await Race.create({
      tournament_id: autumnSprint._id,
      round_id: autumnFinal._id,
      name: 'Autumn Trophy',
      race_date: addDays(-6, 14),
      distance: 1700,
      max_participants: 10,
      prize_pool: 85000000,
      prize_currency: 'VND',
      location: 'Hanoi Autumn Track',
      referee_id: refereeProfiles.referee2._id,
      status: 'completed'
    }),
    autumnReserve: await Race.create({
      tournament_id: autumnSprint._id,
      round_id: autumnQualifier._id,
      name: 'Autumn Reserve',
      race_date: addDays(34, 16),
      distance: 1000,
      max_participants: 6,
      prize_pool: 20000000,
      prize_currency: 'VND',
      location: 'Hanoi Autumn Track',
      referee_id: refereeProfiles.referee1._id,
      status: 'cancelled'
    }),
    coastalHeat: await Race.create({
      tournament_id: coastalDerby._id,
      round_id: coastalQualifier._id,
      name: 'Coastal Heat',
      race_date: addDays(41, 9),
      distance: 1200,
      max_participants: 8,
      prize_pool: 38000000,
      prize_currency: 'VND',
      location: 'Nha Trang Coastal Track',
      referee_id: refereeProfiles.referee1._id,
      status: 'scheduled'
    }),
    coastalTrial: await Race.create({
      tournament_id: coastalDerby._id,
      round_id: coastalQualifier._id,
      name: 'Coastal Trial',
      race_date: addDays(42, 10),
      distance: 1500,
      max_participants: 8,
      prize_pool: 52000000,
      prize_currency: 'VND',
      location: 'Nha Trang Coastal Track',
      referee_id: refereeProfiles.referee1._id,
      status: 'scheduled'
    }),
    coastalFinal: await Race.create({
      tournament_id: coastalDerby._id,
      round_id: coastalFinalRound._id,
      name: 'Coastal Final',
      race_date: addDays(-4, 15),
      distance: 1900,
      max_participants: 10,
      prize_pool: 100000000,
      prize_currency: 'VND',
      location: 'Nha Trang Coastal Track',
      referee_id: refereeProfiles.referee1._id,
      status: 'completed'
    }),
    nightWarmup: await Race.create({
      tournament_id: nightTrack._id,
      round_id: nightQualifier._id,
      name: 'Night Warmup',
      race_date: addDays(50, 19),
      distance: 1000,
      max_participants: 6,
      prize_pool: 24000000,
      prize_currency: 'VND',
      location: 'Can Tho Night Arena',
      referee_id: refereeProfiles.referee2._id,
      status: 'scheduled'
    }),
    midnightSprint: await Race.create({
      tournament_id: nightTrack._id,
      round_id: nightQualifier._id,
      name: 'Midnight Sprint',
      race_date: addDays(51, 20),
      distance: 1250,
      max_participants: 8,
      prize_pool: 36000000,
      prize_currency: 'VND',
      location: 'Can Tho Night Arena',
      referee_id: refereeProfiles.referee2._id,
      status: 'running'
    }),
    lanternFinal: await Race.create({
      tournament_id: nightTrack._id,
      round_id: nightFinalRound._id,
      name: 'Lantern Final',
      race_date: addDays(-8, 20),
      distance: 1600,
      max_participants: 10,
      prize_pool: 70000000,
      prize_currency: 'VND',
      location: 'Can Tho Night Arena',
      referee_id: refereeProfiles.referee2._id,
      status: 'completed'
    })
  };

  await Promise.all([
    Race.updateMany(
      { tournament_id: autumnSprint._id },
      { $set: { entry_fee: 16000000, entry_fee_currency: 'VND' } }
    ),
    Race.updateMany(
      { tournament_id: coastalDerby._id },
      { $set: { entry_fee: 22000000, entry_fee_currency: 'VND' } }
    ),
    Race.updateMany(
      { tournament_id: nightTrack._id },
      { $set: { entry_fee: 12000000, entry_fee_currency: 'VND' } }
    )
  ]);

  const horses = {
    copperComet: await Horse.create({
      owner_id: ownerProfiles.owner1._id,
      name: 'Copper Comet',
      breed: 'Thoroughbred',
      gender: 'male',
      date_of_birth: new Date('2020-08-08T00:00:00.000Z'),
      color: 'Copper',
      weight: 478,
      health_status: 'Ready for autumn sprint entry.',
      registration_number: 'HR-COPPER-007',
      image_url: horseImages[0],
      status: 'active'
    }),
    mistyLane: await Horse.create({
      owner_id: ownerProfiles.owner1._id,
      name: 'Misty Lane',
      breed: 'Arabian',
      gender: 'female',
      date_of_birth: new Date('2021-04-12T00:00:00.000Z'),
      color: 'Grey',
      weight: 454,
      health_status: 'Race ready, monitor warmup.',
      registration_number: 'HR-MISTY-008',
      image_url: horseImages[1],
      status: 'active'
    }),
    oakRunner: await Horse.create({
      owner_id: ownerProfiles.owner1._id,
      name: 'Oak Runner',
      breed: 'Warmblood',
      gender: 'male',
      date_of_birth: new Date('2019-02-19T00:00:00.000Z'),
      color: 'Bay',
      weight: 488,
      health_status: 'Completed race, recovery normal.',
      registration_number: 'HR-OAK-009',
      image_url: horseImages[2],
      status: 'active'
    }),
    seaGlass: await Horse.create({
      owner_id: ownerProfiles.owner1._id,
      name: 'Sea Glass',
      breed: 'Thoroughbred',
      gender: 'female',
      date_of_birth: new Date('2022-01-15T00:00:00.000Z'),
      color: 'Dapple Grey',
      weight: 446,
      health_status: 'Training only, not active for races.',
      registration_number: 'HR-SEAGLASS-010',
      image_url: horseImages[3],
      status: 'inactive'
    }),
    coastalKing: await Horse.create({
      owner_id: ownerProfiles.owner2._id,
      name: 'Coastal King',
      breed: 'Thoroughbred',
      gender: 'male',
      date_of_birth: new Date('2018-12-01T00:00:00.000Z'),
      color: 'Dark Bay',
      weight: 496,
      health_status: 'Cleared for coastal heat.',
      registration_number: 'HR-COASTAL-011',
      image_url: horseImages[4],
      status: 'active'
    }),
    dawnVelvet: await Horse.create({
      owner_id: ownerProfiles.owner2._id,
      name: 'Dawn Velvet',
      breed: 'Arabian',
      gender: 'female',
      date_of_birth: new Date('2020-07-22T00:00:00.000Z'),
      color: 'Chestnut',
      weight: 459,
      health_status: 'Pending registration review.',
      registration_number: 'HR-DAWN-012',
      image_url: horseImages[5],
      status: 'active'
    }),
    shadowLake: await Horse.create({
      owner_id: ownerProfiles.owner2._id,
      name: 'Shadow Lake',
      breed: 'Thoroughbred',
      gender: 'male',
      date_of_birth: new Date('2019-10-30T00:00:00.000Z'),
      color: 'Black',
      weight: 482,
      health_status: 'Coastal Final finisher.',
      registration_number: 'HR-SHADOW-013',
      image_url: horseImages[0],
      status: 'active'
    }),
    mapleStar: await Horse.create({
      owner_id: ownerProfiles.owner2._id,
      name: 'Maple Star',
      breed: 'Quarter Horse',
      gender: 'female',
      date_of_birth: new Date('2021-09-09T00:00:00.000Z'),
      color: 'Sorrel',
      weight: 451,
      health_status: 'Contract review race entry.',
      registration_number: 'HR-MAPLE-014',
      image_url: horseImages[1],
      status: 'active'
    })
  };

  await Registration.insertMany([
    {
      tournament_id: autumnSprint._id,
      race_id: races.autumnOpener._id,
      horse_id: horses.copperComet._id,
      owner_id: ownerProfiles.owner1._id,
      status: 'approved',
      note: 'Ready for owner jockey invitation picker.',
      admin_note: 'Approved, no jockey assigned.',
      registered_at: addDays(-10, 9),
      approved_by: users.admin._id,
      approved_at: addDays(-9, 10)
    },
    {
      tournament_id: autumnSprint._id,
      race_id: races.autumnDash._id,
      horse_id: horses.mistyLane._id,
      owner_id: ownerProfiles.owner1._id,
      status: 'approved',
      note: 'Meeting accepted scenario.',
      admin_note: 'Approved for autumn dash.',
      registered_at: addDays(-9, 11),
      approved_by: users.admin._id,
      approved_at: addDays(-8, 9)
    },
    {
      tournament_id: autumnSprint._id,
      race_id: races.autumnTrophy._id,
      horse_id: horses.oakRunner._id,
      owner_id: ownerProfiles.owner1._id,
      status: 'approved',
      note: 'Completed race with draft result data.',
      admin_note: 'Approved for autumn trophy.',
      registered_at: addDays(-18, 9),
      approved_by: users.admin._id,
      approved_at: addDays(-17, 9)
    },
    {
      tournament_id: autumnSprint._id,
      race_id: races.autumnReserve._id,
      horse_id: horses.seaGlass._id,
      owner_id: ownerProfiles.owner1._id,
      status: 'cancelled',
      note: 'Owner cancelled inactive horse entry.',
      admin_note: 'Cancelled before race setup.',
      registered_at: addDays(-6, 13)
    },
    {
      tournament_id: coastalDerby._id,
      race_id: races.coastalHeat._id,
      horse_id: horses.coastalKing._id,
      owner_id: ownerProfiles.owner2._id,
      status: 'approved',
      note: 'Accepted assignment for coastal heat.',
      admin_note: 'Approved.',
      registered_at: addDays(-11, 9),
      approved_by: users.admin._id,
      approved_at: addDays(-10, 10)
    },
    {
      tournament_id: coastalDerby._id,
      race_id: races.coastalTrial._id,
      horse_id: horses.dawnVelvet._id,
      owner_id: ownerProfiles.owner2._id,
      status: 'pending',
      note: 'Pending coastal trial review.',
      registered_at: addDays(-1, 11)
    },
    {
      tournament_id: coastalDerby._id,
      race_id: races.coastalFinal._id,
      horse_id: horses.shadowLake._id,
      owner_id: ownerProfiles.owner2._id,
      status: 'approved',
      note: 'Published coastal result.',
      admin_note: 'Approved for coastal final.',
      registered_at: addDays(-16, 10),
      approved_by: users.admin._id,
      approved_at: addDays(-15, 10)
    },
    {
      tournament_id: nightTrack._id,
      race_id: races.nightWarmup._id,
      horse_id: horses.mapleStar._id,
      owner_id: ownerProfiles.owner2._id,
      status: 'approved',
      note: 'Contract rejected assignment scenario.',
      admin_note: 'Approved for night warmup.',
      registered_at: addDays(-7, 10),
      approved_by: users.admin._id,
      approved_at: addDays(-6, 10)
    }
  ]);

  await JockeyAssignment.insertMany([
    {
      race_id: races.autumnDash._id,
      horse_id: horses.mistyLane._id,
      owner_id: ownerProfiles.owner1._id,
      jockey_id: jockeyProfiles.jockey1._id,
      status: 'meeting_accepted',
      invitation_message: 'Meeting accepted for Autumn Dash.',
      meeting: {
        title: 'Misty Lane Autumn Dash Briefing',
        meeting_url: 'https://meet.google.com/misty-lane-dash',
        meeting_time: addDays(-2, 9),
        note: 'Pre-race briefing accepted.',
        accepted_at: addDays(-2, 10),
        response_message: 'Meeting accepted.'
      },
      invited_at: addDays(-3, 9),
      responded_at: addDays(-2, 10)
    },
    {
      race_id: races.autumnTrophy._id,
      horse_id: horses.oakRunner._id,
      owner_id: ownerProfiles.owner1._id,
      jockey_id: jockeyProfiles.jockey2._id,
      status: 'terms_agreed',
      invitation_message: 'Terms agreed after Autumn Trophy meeting.',
      meeting: {
        title: 'Oak Runner Autumn Trophy Briefing',
        meeting_url: 'https://meet.google.com/oak-runner-trophy',
        meeting_time: addDays(-8, 9),
        accepted_at: addDays(-8, 10),
        response_message: 'Accepted.'
      },
      terms: {
        agreed_terms: 'Base fee plus placement bonus.',
        meeting_note: 'Terms agreed, contract pending.',
        agreed_at: addDays(-7, 9),
        updated_by: users.owner1._id
      },
      invited_at: addDays(-9, 8),
      responded_at: addDays(-8, 10)
    },
    {
      race_id: races.coastalHeat._id,
      horse_id: horses.coastalKing._id,
      owner_id: ownerProfiles.owner2._id,
      jockey_id: jockeyProfiles.jockey3._id,
      status: 'accepted',
      invitation_message: 'Coastal Heat assignment confirmed.',
      meeting: {
        title: 'Coastal King Heat Briefing',
        meeting_url: 'https://meet.google.com/coastal-king-heat',
        meeting_time: addDays(-2, 11),
        accepted_at: addDays(-2, 12),
        response_message: 'Ready for coastal heat.'
      },
      terms: {
        agreed_terms: 'Standard heat agreement.',
        meeting_note: 'All terms accepted.',
        agreed_at: addDays(-1, 9),
        updated_by: users.owner2._id
      },
      contract: {
        contract_number: 'CTR-COASTAL-001',
        title: 'Coastal King Heat Agreement',
        file_url: 'https://example.com/contracts/coastal-king-heat.pdf',
        file_type: 'application/pdf',
        file_name: 'coastal-king-heat.pdf',
        uploaded_at: addDays(-1, 10),
        confirmed_at: addDays(-1, 11)
      },
      invited_at: addDays(-3, 11),
      responded_at: addDays(-2, 12)
    },
    {
      race_id: races.coastalFinal._id,
      horse_id: horses.shadowLake._id,
      owner_id: ownerProfiles.owner2._id,
      jockey_id: jockeyProfiles.jockey1._id,
      status: 'cancelled',
      invitation_message: 'Assignment cancelled after coastal final.',
      meeting: {
        title: 'Shadow Lake Coastal Final Briefing',
        meeting_url: 'https://meet.google.com/shadow-lake-final',
        meeting_time: addDays(-7, 10),
        rejected_at: addDays(-6, 8),
        response_message: 'Cancelled after schedule change.'
      },
      invited_at: addDays(-8, 9),
      responded_at: addDays(-6, 8)
    },
    {
      race_id: races.nightWarmup._id,
      horse_id: horses.mapleStar._id,
      owner_id: ownerProfiles.owner2._id,
      jockey_id: jockeyProfiles.jockey4._id,
      status: 'contract_rejected',
      invitation_message: 'Contract rejected scenario for review UI.',
      meeting: {
        title: 'Maple Star Night Warmup Briefing',
        meeting_url: 'https://meet.google.com/maple-star-warmup',
        meeting_time: addDays(-4, 20),
        accepted_at: addDays(-4, 21),
        response_message: 'Accepted meeting.'
      },
      terms: {
        agreed_terms: 'Night race terms.',
        meeting_note: 'Contract later rejected by jockey.',
        agreed_at: addDays(-3, 19),
        updated_by: users.owner2._id
      },
      contract: {
        contract_number: 'CTR-MAPLE-001',
        title: 'Maple Star Night Warmup Agreement',
        file_url: 'https://example.com/contracts/maple-star-warmup.pdf',
        file_type: 'application/pdf',
        file_name: 'maple-star-warmup.pdf',
        uploaded_at: addDays(-3, 20),
        rejected_at: addDays(-2, 20),
        response_message: 'Payment terms need revision.'
      },
      invited_at: addDays(-5, 19),
      responded_at: addDays(-2, 20)
    }
  ]);

  await HorseCheck.insertMany([
    {
      race_id: races.autumnDash._id,
      horse_id: horses.mistyLane._id,
      jockey_id: jockeyProfiles.jockey1._id,
      referee_id: refereeProfiles.referee2._id,
      phase: 'during_race',
      status: 'normal',
      checklist: { pace: true, incident: false },
      event_type: 'race_monitor',
      severity: 'none',
      time_marker: '600m',
      description: 'No incident during running state.',
      is_eligible: true,
      checked_at: addDays(33, 10, 30)
    },
    {
      race_id: races.autumnTrophy._id,
      horse_id: horses.oakRunner._id,
      jockey_id: jockeyProfiles.jockey2._id,
      referee_id: refereeProfiles.referee2._id,
      phase: 'post_race',
      status: 'passed',
      checklist: { cooldown: true, injury: false },
      health_status: 'Normal after race.',
      weight: 488,
      check_note: 'Post-race check passed.',
      is_eligible: true,
      checked_at: addDays(-6, 16)
    },
    {
      race_id: races.coastalHeat._id,
      horse_id: horses.coastalKing._id,
      jockey_id: jockeyProfiles.jockey3._id,
      referee_id: refereeProfiles.referee1._id,
      phase: 'pre_race',
      status: 'needs_review',
      checklist: { gait: true, tack: false, documents: true },
      issues: [{ code: 'TACK_ADJUST', severity: 'medium', note: 'Tack needs adjustment before start.' }],
      health_status: 'Fit, equipment needs follow-up.',
      weight: 496,
      check_note: 'Equipment review required.',
      is_eligible: true,
      checked_at: addDays(41, 8)
    },
    {
      race_id: races.nightWarmup._id,
      horse_id: horses.mapleStar._id,
      jockey_id: jockeyProfiles.jockey4._id,
      referee_id: refereeProfiles.referee2._id,
      phase: 'pre_race',
      status: 'failed',
      checklist: { gait: false, tack: true, documents: true },
      issues: [{ code: 'GAIT_IRREGULAR', severity: 'high', note: 'Irregular gait before warmup.' }],
      requires_violation: true,
      health_status: 'Needs vet clearance.',
      weight: 451,
      check_note: 'Not eligible until vet follow-up.',
      is_eligible: false,
      checked_at: addDays(50, 18)
    }
  ]);

  await Violation.insertMany([
    {
      race_id: races.coastalHeat._id,
      horse_id: horses.coastalKing._id,
      jockey_id: jockeyProfiles.jockey3._id,
      referee_id: refereeProfiles.referee1._id,
      violation_type: 'equipment_violation',
      description: 'Tack adjustment required before race start.',
      severity: 'major',
      time_marker: 'pre-race',
      decision: 'review',
      penalty: {
        type: 'warning',
        note: 'Must pass recheck'
      },
      status: 'recorded',
      created_at: addDays(41, 8)
    },
    {
      race_id: races.nightWarmup._id,
      horse_id: horses.mapleStar._id,
      jockey_id: jockeyProfiles.jockey4._id,
      referee_id: refereeProfiles.referee2._id,
      violation_type: 'track_safety_issue',
      description: 'Horse requires veterinary follow-up after failed gait check.',
      severity: 'critical',
      time_marker: 'pre-race',
      decision: 'requires_vet_follow_up',
      penalty: {
        type: 'disqualification',
        note: 'Cannot start until cleared'
      },
      status: 'under_review',
      created_at: addDays(50, 18)
    }
  ]);

  await RefereeReport.insertMany([
    {
      race_id: races.autumnDash._id,
      referee_id: refereeProfiles.referee2._id,
      report_title: 'Autumn Dash Live Monitor Note',
      report_content: 'Race currently running with normal pace.',
      race_condition: 'normal',
      weather: 'Cloudy',
      track_condition: 'Firm',
      conclusion: 'Continue monitoring.',
      status: 'draft',
      created_at: addDays(33, 10)
    },
    {
      race_id: races.autumnTrophy._id,
      referee_id: refereeProfiles.referee2._id,
      report_title: 'Autumn Trophy Final Report',
      report_content: 'Race completed cleanly with Oak Runner in first position.',
      race_condition: 'normal',
      weather: 'Dry',
      track_condition: 'Fast',
      conclusion: 'Result ready for admin confirmation.',
      status: 'submitted',
      created_at: addDays(-6, 16),
      submitted_at: addDays(-6, 17)
    },
    {
      race_id: races.coastalHeat._id,
      referee_id: refereeProfiles.referee1._id,
      report_title: 'Coastal Heat Equipment Review',
      report_content: 'Equipment adjustment required before race day.',
      race_condition: 'needs_review',
      weather: 'Humid',
      track_condition: 'Good',
      conclusion: 'Recheck required.',
      status: 'draft',
      created_at: addDays(41, 8)
    }
  ]);

  const oakResult = await RaceResult.create({
    race_id: races.autumnTrophy._id,
    horse_id: horses.oakRunner._id,
    jockey_id: jockeyProfiles.jockey2._id,
    position: 1,
    finish_time: 103.76,
    score: 95,
    status: 'confirmed',
    note: 'Awaiting publication.',
    recorded_by: refereeProfiles.referee2._id,
    recorded_at: addDays(-6, 16),
    confirmed_by: users.admin._id,
    confirmed_at: addDays(-6, 17)
  });
  const shadowResult = await RaceResult.create({
    race_id: races.coastalFinal._id,
    horse_id: horses.shadowLake._id,
    jockey_id: jockeyProfiles.jockey1._id,
    position: 1,
    finish_time: 112.05,
    score: 100,
    status: 'published',
    note: 'Coastal Final winner.',
    recorded_by: refereeProfiles.referee1._id,
    recorded_at: addDays(-4, 16),
    confirmed_by: users.admin._id,
    confirmed_at: addDays(-4, 17),
    published_at: addDays(-4, 18)
  });
  const coastalKingResult = await RaceResult.create({
    race_id: races.coastalFinal._id,
    horse_id: horses.coastalKing._id,
    jockey_id: jockeyProfiles.jockey3._id,
    position: 2,
    finish_time: 113.44,
    score: 80,
    status: 'published',
    note: 'Second place in Coastal Final.',
    recorded_by: refereeProfiles.referee1._id,
    recorded_at: addDays(-4, 16),
    confirmed_by: users.admin._id,
    confirmed_at: addDays(-4, 17),
    published_at: addDays(-4, 18)
  });

  const autumnPrize = await Prize.create({
    tournament_id: autumnSprint._id,
    race_id: races.autumnTrophy._id,
    prize_name: 'Autumn Trophy Winner',
    position: 1,
    amount: 12000,
    description: 'Winner prize for Autumn Trophy.'
  });
  const coastalPrize = await Prize.create({
    tournament_id: coastalDerby._id,
    race_id: races.coastalFinal._id,
    prize_name: 'Coastal Final Winner',
    position: 1,
    amount: 18000,
    description: 'Winner prize for Coastal Final.'
  });
  await PrizeAward.insertMany([
    {
      prize_id: autumnPrize._id,
      race_result_id: oakResult._id,
      horse_id: horses.oakRunner._id,
      owner_id: ownerProfiles.owner1._id,
      amount: 12000,
      status: 'pending',
      awarded_at: addDays(-5, 10)
    },
    {
      prize_id: coastalPrize._id,
      race_result_id: shadowResult._id,
      horse_id: horses.shadowLake._id,
      owner_id: ownerProfiles.owner2._id,
      amount: 18000,
      status: 'awarded',
      awarded_at: addDays(-3, 10)
    }
  ]);

  await Bet.insertMany([
    buildSeedBet({
      spectator_id: users.spectator1._id,
      race_id: races.autumnTrophy._id,
      predicted_horse_id: horses.oakRunner._id,
      status: 'pending',
      payout_amount: 0,
      submitted_at: addDays(-7, 12),
      seed_horse_name: 'Oak Runner'
    }),
    buildSeedBet({
      spectator_id: users.spectator2._id,
      race_id: races.coastalFinal._id,
      predicted_horse_id: horses.shadowLake._id,
      status: 'won',
      payout_amount: 420,
      submitted_at: addDays(-5, 12),
      checked_at: addDays(-4, 18),
      seed_horse_name: 'Shadow Lake'
    }),
    buildSeedBet({
      spectator_id: users.spectator1._id,
      race_id: races.coastalFinal._id,
      predicted_horse_id: horses.coastalKing._id,
      status: 'lost',
      payout_amount: 0,
      submitted_at: addDays(-5, 13),
      checked_at: addDays(-4, 18),
      seed_horse_name: 'Coastal King'
    }),
    buildSeedBet({
      spectator_id: users.spectator2._id,
      race_id: races.nightWarmup._id,
      predicted_horse_id: horses.mapleStar._id,
      status: 'pending',
      payout_amount: 0,
      submitted_at: addDays(49, 18),
      seed_horse_name: 'Maple Star'
    })
  ]);

  await Notification.insertMany([
    {
      user_id: users.owner1._id,
      title: 'Copper Comet approved',
      content: 'Copper Comet is ready for Autumn Opener and has no jockey yet.',
      type: 'registration',
      is_read: false,
      created_at: addDays(-9, 10)
    },
    {
      user_id: users.jockey1._id,
      title: 'Meeting accepted',
      content: 'You accepted the Misty Lane Autumn Dash briefing.',
      type: 'jockey_assignment',
      is_read: true,
      created_at: addDays(-2, 10)
    },
    {
      user_id: users.referee2._id,
      title: 'Night Warmup check needed',
      content: 'Maple Star requires a vet follow-up before Night Warmup.',
      type: 'horse_check',
      is_read: false,
      created_at: addDays(50, 18)
    }
  ]);
}

async function seedBulkDemoData({ users, roles, ownerProfiles, jockeyProfiles, refereeProfiles }) {
  const bulkJockeyProfiles = [];
  const jockeyNames = [
    'Jockey Echo',
    'Jockey Falcon',
    'Jockey Grove',
    'Jockey Harbor',
    'Jockey Iris',
    'Jockey Jade',
    'Jockey Kite',
    'Jockey Lotus'
  ];

  for (let index = 0; index < jockeyNames.length; index += 1) {
    const number = index + 5;
    const user = await createUser({
      email: `jockey${number}@racing.test`,
      fullName: jockeyNames[index],
      roleName: 'jockey',
      roles,
      avatarUrl: avatarImages[index % avatarImages.length],
      phone: `+8409000000${30 + number}`
    });

    bulkJockeyProfiles.push(await Jockey.create({
      user_id: user._id,
      height: 164 + (index % 7),
      weight: 51 + (index % 6),
      experience_years: 2 + index,
      license_number: `JCK-${String(number).padStart(3, '0')}`,
      total_races: 18 + (index * 7),
      total_wins: 3 + (index * 2),
      status: index === 7 ? 'inactive' : 'active'
    }));
  }

  const jockeyPool = [
    jockeyProfiles.jockey1,
    jockeyProfiles.jockey2,
    jockeyProfiles.jockey3,
    jockeyProfiles.jockey4,
    ...bulkJockeyProfiles
  ];

  const tournamentNames = [
    ['Highland Cup 2026', 'Da Lat Highland Track'],
    ['River Sprint 2026', 'Mekong Rivercourse'],
    ['Capital Classic 2026', 'Hanoi Capital Track'],
    ['Sunset Stakes 2026', 'Phu Quoc Sunset Track'],
    ['Emerald Mile 2026', 'Hue Emerald Course'],
    ['Royal Turf 2026', 'Saigon Royal Turf'],
    ['Lotus Derby 2026', 'Dong Thap Lotus Park'],
    ['Dragon Cup 2026', 'Ha Long Dragon Track'],
    ['Pearl Coast 2026', 'Nha Trang Pearl Course'],
    ['Monsoon Trial 2026', 'Can Tho Monsoon Arena'],
    ['Crescent Stakes 2026', 'Crescent City Racecourse'],
    ['Red River Cup 2026', 'Red River Track'],
    ['Golden Bridge Derby 2026', 'Ba Na Hills Turf'],
    ['Lantern Mile 2026', 'Hoi An Lantern Course'],
    ['Southern Classic 2026', 'Southern Classic Arena']
  ];

  const raceStatuses = ['scheduled', 'running', 'completed'];
  const tournaments = [];
  const races = [];
  const completedRaces = [];

  for (let index = 0; index < tournamentNames.length; index += 1) {
    const [name, location] = tournamentNames[index];
    const tournament = await Tournament.create({
      name,
      description: `Bulk seeded tournament ${index + 1} for dashboard density and real list states.`,
      location,
      image_url: tournamentImages[index % tournamentImages.length],
      start_date: addDays(60 + (index * 4), 9),
      end_date: addDays(62 + (index * 4), 18),
      status: index % 4 === 0 ? 'scheduled' : 'active',
      created_by: users.admin._id
    });
    tournaments.push(tournament);

    const qualifier = await Round.create({
      tournament_id: tournament._id,
      name: 'Qualifier',
      round_order: 1,
      description: `${name} qualifier round.`,
      status: 'active'
    });
    const final = await Round.create({
      tournament_id: tournament._id,
      name: 'Final',
      round_order: 2,
      description: `${name} final round.`,
      status: index % 3 === 0 ? 'completed' : 'scheduled'
    });

    for (let raceIndex = 0; raceIndex < 3; raceIndex += 1) {
      const status = raceStatuses[(index + raceIndex) % raceStatuses.length];
      const race = await Race.create({
        tournament_id: tournament._id,
        round_id: raceIndex === 2 ? final._id : qualifier._id,
        name: `${name.replace(' 2026', '')} ${raceIndex === 2 ? 'Final' : `Heat ${raceIndex + 1}`}`,
        race_date: status === 'completed' ? addDays(-12 - index, 10 + raceIndex) : addDays(60 + (index * 4) + raceIndex, 9 + raceIndex),
        distance: 1000 + (raceIndex * 300) + ((index % 3) * 100),
        max_participants: raceIndex === 2 ? 10 : 8,
        prize_pool: getBulkRacePrizePool(index, raceIndex),
        prize_currency: 'VND',
        entry_fee: 15000000 + (index * 500000),
        entry_fee_currency: 'VND',
        location,
        referee_id: index % 2 === 0 ? refereeProfiles.referee1._id : refereeProfiles.referee2._id,
        status
      });
      races.push(race);
      if (status === 'completed') completedRaces.push(race);
    }
  }

  const horseNames = [
    'Amber Rush',
    'Blue Orchard',
    'Crimson Vale',
    'Desert Bloom',
    'Echo Ridge',
    'Forest Bell',
    'Granite Song',
    'Harbor Light',
    'Ivory Pulse',
    'Juniper Run',
    'Kingfisher',
    'Lavender Sky',
    'Marble Dawn',
    'Northern Ace',
    'Opal Flame',
    'Prairie Moon',
    'Quartz Line',
    'Red Lantern',
    'Sable Drift',
    'Topaz Rain',
    'Umber Trail',
    'Velvet Peak',
    'Willow Mark',
    'Xanadu Star',
    'Yellow Harbor',
    'Zephyr Gate',
    'Aurora Step',
    'Beryl Crown'
  ];

  const horses = [];
  for (let index = 0; index < horseNames.length; index += 1) {
    horses.push(await Horse.create({
      owner_id: index % 2 === 0 ? ownerProfiles.owner1._id : ownerProfiles.owner2._id,
      name: horseNames[index],
      breed: index % 3 === 0 ? 'Thoroughbred' : index % 3 === 1 ? 'Arabian' : 'Quarter Horse',
      gender: index % 2 === 0 ? 'male' : 'female',
      date_of_birth: new Date(`${2018 + (index % 5)}-${String((index % 12) + 1).padStart(2, '0')}-15T00:00:00.000Z`),
      color: ['Bay', 'Grey', 'Chestnut', 'Black', 'Palomino'][index % 5],
      weight: 445 + (index % 12) * 5,
      health_status: index % 9 === 0 ? 'Needs updated medical note.' : 'Ready for seeded race workflow.',
      registration_number: `HR-BULK-${String(index + 15).padStart(3, '0')}`,
      image_url: horseImages[index % horseImages.length],
      status: index % 10 === 0 ? 'inactive' : 'active'
    }));
  }

  const registrations = [];
  const registrationStatuses = ['approved', 'approved', 'approved', 'pending', 'rejected', 'cancelled'];
  for (let index = 0; index < 28; index += 1) {
    const race = races[index % races.length];
    const horse = horses[index];
    const ownerId = horse.owner_id;
    const status = registrationStatuses[index % registrationStatuses.length];
    registrations.push(await Registration.create({
      tournament_id: race.tournament_id,
      race_id: race._id,
      horse_id: horse._id,
      owner_id: ownerId,
      status,
      note: `Bulk ${status} registration for real dashboard data.`,
      admin_note: status === 'approved' ? 'Bulk registration approved.' : status === 'rejected' ? 'Bulk registration rejected for scenario coverage.' : '',
      registered_at: addDays(-20 + index, 9),
      approved_by: ['approved', 'rejected'].includes(status) ? users.admin._id : undefined,
      approved_at: ['approved', 'rejected'].includes(status) ? addDays(-19 + index, 10) : undefined
    }));
  }

  const approvedRegistrations = registrations.filter((registration) => registration.status === 'approved');
  const assignmentStatuses = [
    'meeting_invited',
    'meeting_accepted',
    'terms_agreed',
    'contract_uploaded',
    'accepted',
    'contract_rejected',
    'cancelled'
  ];
  const assignedRegistrations = approvedRegistrations.slice(0, 16);

  for (let index = 0; index < assignedRegistrations.length; index += 1) {
    const registration = assignedRegistrations[index];
    const status = assignmentStatuses[index % assignmentStatuses.length];
    const jockey = jockeyPool[index % jockeyPool.length];
    const accepted = ['meeting_accepted', 'terms_agreed', 'contract_uploaded', 'accepted', 'contract_rejected'].includes(status);
    const hasTerms = ['terms_agreed', 'contract_uploaded', 'accepted', 'contract_rejected'].includes(status);
    const hasContract = ['contract_uploaded', 'accepted', 'contract_rejected'].includes(status);

    await JockeyAssignment.create({
      race_id: registration.race_id,
      horse_id: registration.horse_id,
      owner_id: registration.owner_id,
      jockey_id: jockey._id,
      status,
      invitation_message: `Bulk ${status} assignment scenario.`,
      meeting: {
        title: `Bulk Assignment Briefing ${index + 1}`,
        meeting_url: `https://meet.google.com/bulk-assignment-${index + 1}`,
        meeting_time: addDays(index - 8, 10),
        note: 'Generated for real assignment state coverage.',
        accepted_at: accepted ? addDays(index - 8, 11) : undefined,
        rejected_at: status === 'cancelled' ? addDays(index - 7, 9) : undefined,
        response_message: accepted ? 'Accepted seeded meeting.' : status === 'cancelled' ? 'Cancelled seeded meeting.' : ''
      },
      terms: hasTerms ? {
        agreed_terms: 'Seeded race-day terms.',
        meeting_note: 'Terms generated for dashboard state coverage.',
        agreed_at: addDays(index - 7, 12),
        updated_by: users.admin._id
      } : undefined,
      contract: hasContract ? {
        contract_number: `CTR-BULK-${String(index + 1).padStart(3, '0')}`,
        title: `Bulk Contract ${index + 1}`,
        file_url: `https://example.com/contracts/bulk-${index + 1}.pdf`,
        file_type: 'application/pdf',
        file_name: `bulk-${index + 1}.pdf`,
        uploaded_at: addDays(index - 6, 13),
        confirmed_at: status === 'accepted' ? addDays(index - 6, 14) : undefined,
        rejected_at: status === 'contract_rejected' ? addDays(index - 6, 14) : undefined,
        response_message: status === 'contract_rejected' ? 'Seeded contract revision requested.' : ''
      } : undefined,
      invited_at: addDays(index - 9, 9),
      responded_at: accepted ? addDays(index - 8, 11) : undefined
    });
  }

  for (let index = 0; index < 12; index += 1) {
    const registration = approvedRegistrations[index];
    const jockey = jockeyPool[index % jockeyPool.length];
    if (!registration) break;

    await HorseCheck.create({
      race_id: registration.race_id,
      horse_id: registration.horse_id,
      jockey_id: jockey._id,
      referee_id: index % 2 === 0 ? refereeProfiles.referee1._id : refereeProfiles.referee2._id,
      phase: ['pre_race', 'during_race', 'post_race'][index % 3],
      status: ['passed', 'normal', 'needs_review', 'failed'][index % 4],
      checklist: { documents: true, tack: index % 4 !== 2, gait: index % 4 !== 3 },
      issues: index % 4 >= 2 ? [{ code: 'BULK_REVIEW', severity: index % 4 === 3 ? 'high' : 'medium', note: 'Seeded review issue.' }] : [],
      event_type: index % 3 === 1 ? 'race_monitor' : undefined,
      severity: index % 4 === 3 ? 'high' : index % 4 === 2 ? 'medium' : 'none',
      time_marker: index % 3 === 1 ? `${500 + index * 20}m` : 'pre-race',
      description: 'Bulk horse check for referee screens.',
      requires_violation: index % 4 >= 2,
      health_status: index % 4 === 3 ? 'Requires vet follow-up.' : 'Fit for seeded workflow.',
      weight: 450 + (index % 10) * 4,
      check_note: 'Generated check record.',
      is_eligible: index % 4 !== 3,
      checked_at: addDays(index - 10, 8)
    });
  }

  for (let index = 0; index < 8; index += 1) {
    const registration = approvedRegistrations[index + 2];
    const jockey = jockeyPool[index % jockeyPool.length];
    if (!registration) break;

    await Violation.create({
      race_id: registration.race_id,
      horse_id: registration.horse_id,
      jockey_id: jockey._id,
      referee_id: index % 2 === 0 ? refereeProfiles.referee1._id : refereeProfiles.referee2._id,
      violation_type: ['false_start', 'lane_violation', 'equipment_violation', 'dangerous_riding'][index % 4],
      description: 'Bulk seeded violation for admin/referee density.',
      severity: ['minor', 'major', 'critical'][index % 3],
      time_marker: index % 2 === 0 ? 'pre-race' : `${700 + index * 30}m`,
      evidence_urls: [],
      decision: ['warning', 'review', 'penalty'][index % 3],
      penalty: {
        type: index % 3 === 2 ? 'score_deduction' : 'warning',
        score_deduction: index % 3 === 2 ? 5 : 0,
        note: index % 3 === 2 ? 'Seeded points review' : 'No points penalty'
      },
      status: ['recorded', 'resolved', 'under_review'][index % 3],
      created_at: addDays(index - 8, 10)
    });
  }

  await RefereeReport.insertMany(races.slice(0, 10).map((race, index) => ({
    race_id: race._id,
    referee_id: index % 2 === 0 ? refereeProfiles.referee1._id : refereeProfiles.referee2._id,
    report_title: `Bulk Race Report ${index + 1}`,
    report_content: 'Bulk seeded race report for dashboard and referee list density.',
    race_condition: ['normal', 'needs_review', 'incident_recorded'][index % 3],
    weather: ['Clear', 'Cloudy', 'Humid', 'Light rain'][index % 4],
    track_condition: ['Fast', 'Good', 'Soft'][index % 3],
    conclusion: index % 2 === 0 ? 'Race can proceed.' : 'Follow-up review required.',
    status: index % 3 === 0 ? 'submitted' : 'draft',
    created_at: addDays(index - 12, 9),
    submitted_at: index % 3 === 0 ? addDays(index - 12, 10) : undefined
  })));

  for (let index = 0; index < 10; index += 1) {
    const race = completedRaces[index % completedRaces.length];
    const horse = horses[(index + 4) % horses.length];
    const jockey = jockeyPool[index % jockeyPool.length];
    if (!race || !horse) break;

    const result = await RaceResult.create({
      race_id: race._id,
      horse_id: horse._id,
      jockey_id: jockey._id,
      position: (index % 5) + 1,
      finish_time: 101.2 + index * 1.37,
      score: Math.max(20, 100 - index * 6),
      status: index % 4 === 0 ? 'confirmed' : 'published',
      note: 'Bulk seeded race result.',
      recorded_by: index % 2 === 0 ? refereeProfiles.referee1._id : refereeProfiles.referee2._id,
      recorded_at: addDays(-15 + index, 14),
      confirmed_by: users.admin._id,
      confirmed_at: addDays(-15 + index, 15),
      published_at: index % 4 === 0 ? undefined : addDays(-15 + index, 16)
    });

    const prize = await Prize.create({
      tournament_id: race.tournament_id,
      race_id: race._id,
      prize_name: `Bulk Race Prize ${index + 1}`,
      position: (index % 3) + 1,
      amount: 3000 + index * 750,
      description: 'Generated prize for richer results data.'
    });

    await PrizeAward.create({
      prize_id: prize._id,
      race_result_id: result._id,
      horse_id: horse._id,
      owner_id: horse.owner_id,
      amount: prize.amount,
      status: index % 3 === 0 ? 'pending' : 'awarded',
      awarded_at: addDays(-14 + index, 10)
    });
  }

  for (let index = 0; index < 12; index += 1) {
    const race = races[index % races.length];
    const horse = horses[(index + 8) % horses.length];
    await Bet.create(buildSeedBet({
      spectator_id: index % 2 === 0 ? users.spectator1._id : users.spectator2._id,
      race_id: race._id,
      predicted_horse_id: horse._id,
      status: ['pending', 'won', 'lost'][index % 3],
      payout_amount: index % 3 === 1 ? 180 + index * 20 : 0,
      submitted_at: addDays(index - 12, 12),
      checked_at: index % 3 === 0 ? undefined : addDays(index - 11, 15),
      seed_horse_name: horse.name
    }));
  }

  await Notification.insertMany([
    ...horseNames.slice(0, 8).map((name, index) => ({
      user_id: index % 2 === 0 ? users.owner1._id : users.owner2._id,
      title: `${name} registration updated`,
      content: `${name} has a seeded registration update for dashboard testing.`,
      type: 'registration',
      is_read: index % 3 === 0,
      created_at: addDays(-8 + index, 9)
    })),
    ...jockeyNames.slice(0, 4).map((name, index) => ({
      user_id: users[`jockey${index + 1}`]._id,
      title: `${name} assignment state updated`,
      content: 'A seeded assignment changed state for jockey dashboard testing.',
      type: 'jockey_assignment',
      is_read: false,
      created_at: addDays(-4 + index, 10)
    }))
  ]);
}

function buildSeedOddsEntry(registration, jockey, index, total) {
  const probabilityTemplate = [0.34, 0.27, 0.22, 0.17, 0.12, 0.08];
  const fallbackProbability = Number((1 / total).toFixed(4));
  const winProbability = probabilityTemplate[index] || fallbackProbability;
  const fairOdds = Number((1 / winProbability).toFixed(2));
  const gameOdds = Number(Math.max(1.01, fairOdds * 0.85).toFixed(2));
  const horse = registration.horse_id;
  const jockeyUser = jockey.user_id || {};

  return {
    horse_id: horse._id,
    jockey_id: jockey._id,
    horse_no: index + 1,
    horse_name: horse.name,
    jockey_name: jockeyUser.full_name || `Demo Jockey ${index + 1}`,
    win_probability: winProbability,
    fair_odds: fairOdds,
    game_odds: gameOdds,
    probability_rank: index + 1,
    fallbacks_used: ['seeded_demo_market']
  };
}

async function ensureRealtimeRaceParticipants(race, horses, jockeys, users, targetCount) {
  const selectedHorses = horses.slice(0, targetCount);
  const registrations = [];

  for (let index = 0; index < selectedHorses.length; index += 1) {
    const horse = selectedHorses[index];
    const jockey = jockeys[index % jockeys.length];
    const registration = await Registration.findOneAndUpdate(
      {
        race_id: race._id,
        horse_id: horse._id
      },
      {
        $set: {
          tournament_id: race.tournament_id,
          race_id: race._id,
          horse_id: horse._id,
          owner_id: horse.owner_id,
          status: 'approved',
          note: 'Realtime demo approved registration.',
          admin_note: 'Seeded for current/tomorrow betting and race demo.',
          approved_by: users.admin._id,
          approved_at: addMinutesFromNow(-120)
        },
        $setOnInsert: {
          registered_at: addMinutesFromNow(-180)
        }
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true
      }
    ).populate('horse_id');

    const existingAssignment = await JockeyAssignment.findOne({
      race_id: race._id,
      horse_id: horse._id,
      assignment_type: 'primary'
    }).sort({ invited_at: -1 });

    const assignmentPayload = {
      race_id: race._id,
      horse_id: horse._id,
      owner_id: horse.owner_id,
      jockey_id: jockey._id,
      assignment_type: 'primary',
      status: 'accepted',
      invitation_message: 'Realtime demo accepted assignment.',
      meeting: {
        title: `${horse.name} realtime demo briefing`,
        meeting_url: `https://meet.google.com/demo-${race._id.toString().slice(-6)}-${index + 1}`,
        meeting_time: addMinutesFromNow(-150),
        note: 'Seeded briefing for betting and race engine demo.',
        accepted_at: addMinutesFromNow(-140),
        response_message: 'Accepted for realtime demo.'
      },
      terms: {
        agreed_terms: 'Seeded demo race-day terms.',
        meeting_note: 'Terms accepted for realtime demo.',
        agreed_at: addMinutesFromNow(-130),
        updated_by: users.admin._id
      },
      contract: {
        contract_number: `CTR-REALTIME-${race._id.toString().slice(-6)}-${index + 1}`,
        title: `${horse.name} realtime demo contract`,
        file_url: 'https://example.com/contracts/realtime-demo.pdf',
        file_type: 'application/pdf',
        file_name: 'realtime-demo.pdf',
        uploaded_at: addMinutesFromNow(-125),
        confirmed_at: addMinutesFromNow(-120),
        response_message: 'Confirmed for realtime demo.'
      },
      invited_at: addMinutesFromNow(-160),
      responded_at: addMinutesFromNow(-140)
    };

    if (existingAssignment) {
      await JockeyAssignment.updateOne({ _id: existingAssignment._id }, { $set: assignmentPayload });
    } else {
      await JockeyAssignment.create(assignmentPayload);
    }

    await HorseCheck.create({
      race_id: race._id,
      horse_id: horse._id,
      jockey_id: jockey._id,
      referee_id: race.referee_id,
      phase: 'pre_race',
      status: 'passed',
      checklist: {
        documents: true,
        tack: true,
        gait: true,
        vet_clearance: true
      },
      issues: [],
      severity: 'none',
      description: 'Realtime demo pre-race check passed.',
      requires_violation: false,
      health_status: 'Fit for realtime demo race.',
      weight: horse.weight,
      check_note: 'Seeded pass so race can start during demo.',
      is_eligible: true,
      checked_at: addMinutesFromNow(-30 + index)
    });

    registrations.push(registration);
  }

  return registrations;
}

async function seedRealtimeDemoRaceCoverage({ users }) {
  const raceCount = REALTIME_DEMO_RACE_COUNT + TOMORROW_DEMO_RACE_COUNT;
  const races = await Race.find({ status: 'scheduled' })
    .sort({ race_date: 1, created_at: 1 })
    .limit(raceCount);
  const horses = await Horse.find({ status: 'active' }).sort({ registration_number: 1 }).limit(8);
  const jockeys = await Jockey.find({ status: 'active' })
    .populate('user_id', 'full_name email')
    .sort({ license_number: 1 })
    .limit(8);

  if (races.length < raceCount) {
    throw new Error(`Need at least ${raceCount} scheduled races for realtime demo coverage, found ${races.length}.`);
  }

  if (horses.length < 4 || jockeys.length < 4) {
    throw new Error('Need at least 4 active horses and 4 active jockeys for realtime demo coverage.');
  }

  await Wallet.findOneAndUpdate(
    { user_id: users.spectator1._id },
    { $set: { user_id: users.spectator1._id, token_balance: 10000 } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
  await Wallet.findOneAndUpdate(
    { user_id: users.spectator2._id },
    { $set: { user_id: users.spectator2._id, token_balance: 10000 } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );

  const tomorrowHours = [9, 10, 11, 14, 15, 16];

  for (let index = 0; index < races.length; index += 1) {
    const race = races[index];
    const isRealtimeRace = index < REALTIME_DEMO_RACE_COUNT;
    const raceDate = isRealtimeRace
      ? addMinutesFromNow(-45 + (index * 7))
      : addDays(1, tomorrowHours[index - REALTIME_DEMO_RACE_COUNT], 0);
    const closesAt = isRealtimeRace
      ? addMinutesFromNow(90)
      : new Date(raceDate.getTime() - (5 * 60 * 1000));

    await Race.findByIdAndUpdate(race._id, {
      race_date: raceDate,
      registration_locked: false,
      registration_lock_at: calculateRegistrationLockAt(raceDate),
      status: 'scheduled',
      betting_status: 'open',
      betting_closes_at: closesAt,
      betting_market: {
        status: 'open',
        opens_at: addMinutesFromNow(-60),
        closes_at: closesAt,
        min_stake: 50,
        max_stake: 500,
        currency: 'TOKEN'
      }
    }, { runValidators: true });

    const updatedRace = await Race.findById(race._id);
    const registrations = await ensureRealtimeRaceParticipants(updatedRace, horses, jockeys, users, 4);
    const odds = registrations.map(function(registration, participantIndex) {
      return buildSeedOddsEntry(registration, jockeys[participantIndex % jockeys.length], participantIndex, registrations.length);
    });

    await RaceOddsMarket.findOneAndUpdate(
      { race_id: race._id },
      {
        $set: {
          race_id: race._id,
          status: 'open',
          model_name: 'seed_demo_realtime_odds',
          model_version: 'seed_realtime_v1',
          source: 'seedDemoData.js',
          payout_factor: 0.85,
          generated_by: users.admin._id,
          generated_at: addMinutesFromNow(-55),
          model_metrics: {
            intended_use: 'virtual demo betting'
          },
          input_diagnostics: {
            participant_count: odds.length,
            fallback_count: odds.length,
            fallbacks_used: ['seeded_demo_market'],
            race_payload_id: `seed-${race._id.toString()}`
          },
          odds
        }
      },
      {
        upsert: true,
        returnDocument: 'after',
        runValidators: true
      }
    );
  }

  console.log(`Realtime demo coverage prepared: ${REALTIME_DEMO_RACE_COUNT} current races and ${TOMORROW_DEMO_RACE_COUNT} tomorrow races.`);
}

async function seedBettingMarkets() {
  const openRaces = await Race.find({ status: 'scheduled' }).sort({ race_date: 1 }).limit(10);
  const scheduledRaces = await Race.find({
    status: 'scheduled',
    _id: { $nin: openRaces.map((race) => race._id) }
  }).sort({ race_date: 1 }).limit(12);
  const runningRaces = await Race.find({ status: 'running' }).sort({ race_date: 1 });
  const completedRaces = await Race.find({ status: 'completed' }).sort({ race_date: -1 });
  const cancelledRaces = await Race.find({ status: 'cancelled' }).sort({ race_date: 1 });

  for (const race of openRaces) {
    const closeAt = new Date(race.race_date || addDays(1));
    closeAt.setUTCMinutes(closeAt.getUTCMinutes() - 5);
    await Race.updateOne({ _id: race._id }, bettingMarket('open', addDays(-1, 9), closeAt));
  }

  for (const race of scheduledRaces) {
    const openAt = new Date(race.race_date || addDays(2));
    openAt.setUTCHours(openAt.getUTCHours() - 24);
    const closeAt = new Date(race.race_date || addDays(2));
    closeAt.setUTCMinutes(closeAt.getUTCMinutes() - 5);
    await Race.updateOne({ _id: race._id }, bettingMarket('scheduled', openAt, closeAt));
  }

  for (const race of runningRaces) {
    const closeAt = new Date(race.race_date || addDays(-1));
    closeAt.setUTCMinutes(closeAt.getUTCMinutes() - 5);
    await Race.updateOne({ _id: race._id }, bettingMarket('closed', addDays(-2, 9), closeAt));
  }

  for (const race of completedRaces) {
    await Race.updateOne({ _id: race._id }, bettingMarket('settled', addDays(-7, 9), addDays(-6, 9)));
  }

  for (const race of cancelledRaces) {
    await Race.updateOne({ _id: race._id }, bettingMarket('void', addDays(-3, 9), addDays(-2, 9)));
  }
}

function printAccounts() {
  const accounts = [
    ['Admin', 'admin@racing.test'],
    ['Horse Owner', 'owner1@racing.test'],
    ['Horse Owner', 'owner2@racing.test'],
    ['Jockey', 'jockey1@racing.test'],
    ['Jockey', 'jockey2@racing.test'],
    ['Jockey', 'jockey3@racing.test'],
    ['Jockey', 'jockey4@racing.test'],
    ['Jockey', 'jockey5@racing.test'],
    ['Jockey', 'jockey6@racing.test'],
    ['Jockey', 'jockey7@racing.test'],
    ['Jockey', 'jockey8@racing.test'],
    ['Jockey', 'jockey9@racing.test'],
    ['Jockey', 'jockey10@racing.test'],
    ['Jockey', 'jockey11@racing.test'],
    ['Jockey', 'jockey12@racing.test'],
    ['Race Referee', 'referee1@racing.test'],
    ['Race Referee', 'referee2@racing.test'],
    ['Spectator', 'spectator1@racing.test'],
    ['Spectator', 'spectator2@racing.test']
  ];

  console.log('\nDemo accounts');
  console.log('Password: Password123');
  for (const [role, email] of accounts) {
    console.log(`${role.padEnd(14)} ${email}`);
  }
}

async function main() {
  const shouldReset = hasFlag('--reset');
  const mode = getArgValue('--mode', 'full');
  const confirm = getArgValue('--confirm', '');

  if (!shouldReset) {
    throw new Error('Run with --reset to rebuild demo data.');
  }

  if (mode !== 'full') {
    throw new Error('This script currently supports --mode full only.');
  }

  if (confirm !== 'full-reset') {
    throw new Error('Full reset requires --confirm full-reset.');
  }

  await connectDatabase();
  console.log(`Connected to ${process.env.MONGODB_DB_NAME || 'default MongoDB database'}.`);

  await resetFullDatabase();
  console.log('Full database reset completed.');

  const roles = await createRoles();
  const profiles = await seedUsersAndProfiles(roles);
  const raceDomain = await seedRaceDomain(profiles);
  await seedRegistrations({ ...profiles, ...raceDomain });
  await seedAssignments({ ...profiles, ...raceDomain });
  await seedRefereeAndResults({ ...profiles, ...raceDomain });
  await seedSpectatorAndNotifications({ users: profiles.users, ...raceDomain });
  await seedPaymentDashboardData({ users: profiles.users });
  await seedRoleApplications({ users: profiles.users });
  await seedExpandedDemoData(profiles);
  await seedBulkDemoData({ ...profiles, roles });
  await seedBettingMarkets();
  await seedRealtimeDemoRaceCoverage({ users: profiles.users });

  printAccounts();
  console.log('\nDemo data seeded successfully.');
}

main()
  .catch((error) => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
