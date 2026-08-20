/**
 * Seed the Phase 7 end-to-end racetrack demo.
 *
 * Usage:
 *   node scripts/seedFullDemo.js
 *   node scripts/seedFullDemo.js --replace-tournaments
 *
 * The regular command is idempotent: it creates the demo pack only when the
 * pack is missing. The replacement command explicitly removes every current
 * tournament and its dependent records before creating a fresh 5 x 3 pack.
 */
'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { getSequelize } = require('../config/sequelize');
const { loadSequelizeModels } = require('../models/sequelize');
const {
  evaluateHorseForRace,
  evaluatePreRaceEligibility,
  ELIGIBILITY_STATUS
} = require('../services/racetrackEligibilityService');

const PASSWORD = 'Password123';
const DEMO_PREFIX = 'DEMO 2026';
const REPLACE_TOURNAMENTS = process.argv.includes('--replace-tournaments');
const now = new Date();
const addHours = (date, hours) => new Date(new Date(date).getTime() + hours * 60 * 60 * 1000);

const roles = [
  ['admin', 'System administrator'],
  ['horse_owner', 'Horse owner'],
  ['jockey', 'Jockey'],
  ['race_referee', 'Race referee'],
  ['spectator', 'Spectator']
];

const accounts = [
  { key: 'admin', name: 'Demo Racing Admin', email: 'demo.admin@racing.test', role: 'admin' },
  { key: 'owner1', name: 'Nguyen Minh Owner', email: 'demo.owner1@racing.test', role: 'horse_owner' },
  { key: 'owner2', name: 'Tran Lan Owner', email: 'demo.owner2@racing.test', role: 'horse_owner' },
  { key: 'owner3', name: 'Le Quang Owner', email: 'demo.owner3@racing.test', role: 'horse_owner' },
  { key: 'owner4', name: 'Pham Ha Owner', email: 'demo.owner4@racing.test', role: 'horse_owner' },
  { key: 'owner5', name: 'Do Bao Owner', email: 'demo.owner5@racing.test', role: 'horse_owner' },
  { key: 'jockey1', name: 'Demo Jockey 1', email: 'demo.jockey1@racing.test', role: 'jockey' },
  { key: 'jockey2', name: 'Demo Jockey 2', email: 'demo.jockey2@racing.test', role: 'jockey' },
  { key: 'jockey3', name: 'Demo Jockey 3', email: 'demo.jockey3@racing.test', role: 'jockey' },
  { key: 'jockey4', name: 'Demo Jockey 4', email: 'demo.jockey4@racing.test', role: 'jockey' },
  { key: 'jockey5', name: 'Demo Jockey 5', email: 'demo.jockey5@racing.test', role: 'jockey' },
  { key: 'referee1', name: 'Demo Referee 1', email: 'demo.referee1@racing.test', role: 'race_referee' },
  { key: 'referee2', name: 'Demo Referee 2', email: 'demo.referee2@racing.test', role: 'race_referee' },
  { key: 'referee3', name: 'Demo Referee 3', email: 'demo.referee3@racing.test', role: 'race_referee' },
  { key: 'spectator', name: 'Demo Spectator', email: 'demo.spectator@racing.test', role: 'spectator' }
];

const racetrackFixtures = [
  {
    code: 'PHU_THO',
    name: 'Phu Tho Racetrack',
    address: '2 Le Dai Hanh, Phu Tho Hoa',
    province: 'Ho Chi Minh City',
    eligibility_rule: { schema_version: 1, type: 'horse_weight_range', min_kg: 450, max_kg: 500, ballast_allowed: true }
  },
  {
    code: 'THIEN_MA',
    name: 'Thien Ma Racetrack',
    address: 'Dong Mo Lakeside Road',
    province: 'Hanoi',
    eligibility_rule: { schema_version: 1, type: 'horse_weight_range', min_kg: 400, max_kg: 450, ballast_allowed: true }
  },
  {
    code: 'QUAN_NGUA',
    name: 'Quan Ngua Racetrack',
    address: '30 Van Cao, Lieu Giai',
    province: 'Hanoi',
    eligibility_rule: { schema_version: 1, type: 'horse_age_range', min_years: 4, max_years: 5 }
  },
  {
    code: 'SOC_SON',
    name: 'Soc Son Racetrack',
    address: 'Soc Son Sports Complex',
    province: 'Hanoi',
    eligibility_rule: { schema_version: 1, type: 'horse_breed', allowed_values: ['Thoroughbred'] }
  }
];

const horseFixtures = [
  { no: 1, owner: 1, name: 'Azure Comet', weight: 478, breed: 'Thoroughbred', born: '2021-01-15', color: 'Bay' },
  { no: 2, owner: 2, name: 'Golden Hoof', weight: 486, breed: 'Thoroughbred', born: '2021-03-08', color: 'Chestnut' },
  { no: 3, owner: 3, name: 'Mekong Star', weight: 462, breed: 'Thoroughbred', born: '2022-01-22', color: 'Black' },
  { no: 4, owner: 4, name: 'Royal Breeze', weight: 495, breed: 'Thoroughbred', born: '2021-06-12', color: 'Grey' },
  { no: 5, owner: 5, name: 'Silver Arrow', weight: 442, breed: 'Thoroughbred', born: '2022-04-03', color: 'Brown' },
  { no: 6, owner: 1, name: 'Thien Blaze', weight: 405, breed: 'Thoroughbred', born: '2021-02-28', color: 'Bay' },
  { no: 7, owner: 2, name: 'Lotus Fleet', weight: 418, breed: 'Thoroughbred', born: '2022-05-07', color: 'Chestnut' },
  { no: 8, owner: 3, name: 'Jade Thunder', weight: 432, breed: 'Thoroughbred', born: '2021-09-17', color: 'Black' },
  { no: 9, owner: 4, name: 'River Halo', weight: 444, breed: 'Thoroughbred', born: '2022-02-11', color: 'Grey' },
  { no: 10, owner: 5, name: 'Pearl Mist', weight: 392, breed: 'Thoroughbred', born: '2021-11-19', color: 'Brown' },
  { no: 11, owner: 1, name: 'Hanoi Legend', weight: 470, breed: 'Thoroughbred', born: '2021-01-09', color: 'Bay' },
  { no: 12, owner: 2, name: 'Capital Wind', weight: 474, breed: 'Thoroughbred', born: '2022-02-16', color: 'Chestnut' },
  { no: 13, owner: 3, name: 'Imperial Bloom', weight: 481, breed: 'Thoroughbred', born: '2021-04-27', color: 'Black' },
  { no: 14, owner: 4, name: 'West Lake Star', weight: 469, breed: 'Thoroughbred', born: '2022-06-05', color: 'Grey' },
  { no: 15, owner: 5, name: 'Ba Dinh Dash', weight: 483, breed: 'Thoroughbred', born: '2021-07-23', color: 'Brown' },
  { no: 16, owner: 1, name: 'Veteran Valor', weight: 465, breed: 'Thoroughbred', born: '2018-03-10', color: 'Bay' },
  { no: 17, owner: 2, name: 'Desert Ember', weight: 448, breed: 'Arabian', born: '2022-01-30', color: 'Chestnut' }
];

const participantNumbersByTrack = {
  PHU_THO: [1, 2, 3, 4, 5],
  THIEN_MA: [6, 7, 8, 9, 10],
  QUAN_NGUA: [11, 12, 13, 14, 15],
  SOC_SON: [1, 6, 11, 12, 13]
};

const tournamentFixtures = [
  { title: 'Opening Stakes', date: '2026-08-20', tracks: ['PHU_THO', 'THIEN_MA', 'QUAN_NGUA'] },
  { title: 'Mekong Classic', date: '2026-08-21', tracks: ['SOC_SON', 'PHU_THO', 'THIEN_MA'] },
  { title: 'Saigon Derby', date: '2026-08-22', tracks: ['QUAN_NGUA', 'SOC_SON', 'PHU_THO'] },
  { title: 'Heritage Sprint', date: '2026-08-23', tracks: ['THIEN_MA', 'QUAN_NGUA', 'SOC_SON'] },
  { title: 'Grand Finale', date: '2026-08-25', tracks: ['PHU_THO', 'THIEN_MA', 'QUAN_NGUA'] }
];

const raceHours = ['06:00:00', '12:00:00', '18:00:00'];

function raceTime(tournament, raceIndex) {
  return new Date(tournament.date + 'T' + raceHours[raceIndex] + '+07:00');
}

function snapshotFor(track) {
  return {
    racetrack_id: track.id,
    racetrack_code: track.code,
    rule_version: track.rule_version,
    rule: track.eligibility_rule
  };
}

async function resetTournamentData(sequelize) {
  if (!REPLACE_TOURNAMENTS) return;
  await sequelize.query('TRUNCATE TABLE tournaments RESTART IDENTITY CASCADE');
  console.log('Removed all existing tournament records and their dependent data.');
}

async function ensureBaseAccounts(models) {
  const roleMap = {};
  for (const item of roles) {
    const roleName = item[0];
    const description = item[1];
    const result = await models.Role.findOrCreate({
      where: { role_name: roleName },
      defaults: { role_name: roleName, description }
    });
    roleMap[roleName] = result[0];
  }

  const users = {};
  for (const account of accounts) {
    const result = await models.User.findOrCreate({
      where: { email: account.email },
      defaults: {
        full_name: account.name,
        email: account.email,
        password: bcrypt.hashSync(PASSWORD, 10),
        status: 'active',
        email_verified: true,
        email_verified_at: now
      }
    });
    users[account.key] = result[0];
    await models.UserRole.findOrCreate({
      where: { user_id: result[0].id, role_id: roleMap[account.role].id },
      defaults: { user_id: result[0].id, role_id: roleMap[account.role].id }
    });
  }
  return users;
}

async function ensureProfiles(models, users) {
  const owners = {};
  const jockeys = {};
  const referees = {};

  for (let index = 1; index <= 5; index += 1) {
    const owner = await models.HorseOwner.findOrCreate({
      where: { user_id: users['owner' + index].id },
      defaults: {
        user_id: users['owner' + index].id,
        stable_name: 'Demo Stable ' + index,
        address: 'Ho Chi Minh City',
        license_number: 'OWNER-DEMO-' + index,
        status: 'active'
      }
    });
    owners[index] = owner[0];

    const jockey = await models.Jockey.findOrCreate({
      where: { user_id: users['jockey' + index].id },
      defaults: {
        user_id: users['jockey' + index].id,
        height: 165 + index,
        weight_kg: 52 + index,
        experience_years: 4 + index,
        license_number: 'JOCKEY-DEMO-' + index,
        total_races: 80 + index * 10,
        total_wins: 15 + index,
        status: 'active',
        disciplinary_status: 'clear'
      }
    });
    jockeys[index] = jockey[0];
  }

  for (let index = 1; index <= 3; index += 1) {
    const referee = await models.RaceReferee.findOrCreate({
      where: { user_id: users['referee' + index].id },
      defaults: {
        user_id: users['referee' + index].id,
        license_number: 'REF-DEMO-' + index,
        experience_years: 8 + index,
        status: 'active'
      }
    });
    referees[index] = referee[0];
  }

  const wallet = await models.Wallet.findOrCreate({
    where: { user_id: users.spectator.id },
    defaults: { user_id: users.spectator.id, token_balance: 50000 }
  });
  if (Number(wallet[0].token_balance) < 5000) await wallet[0].update({ token_balance: 50000 });

  return { owners, jockeys, referees };
}

async function ensureRacetracks(models, adminUserId) {
  const tracks = {};
  for (const fixture of racetrackFixtures) {
    const result = await models.Racetrack.findOrCreate({
      where: { code: fixture.code },
      defaults: {
        code: fixture.code,
        name: fixture.name,
        address: fixture.address,
        province: fixture.province,
        country_code: 'VN',
        status: 'active',
        eligibility_rule: fixture.eligibility_rule,
        rule_version: 1,
        created_by: adminUserId,
        updated_by: adminUserId
      }
    });
    const track = result[0];
    await track.update({
      name: fixture.name,
      address: fixture.address,
      province: fixture.province,
      country_code: 'VN',
      status: 'active',
      eligibility_rule: fixture.eligibility_rule,
      updated_by: adminUserId
    });
    tracks[fixture.code] = track;
  }
  return tracks;
}

async function ensureHorses(models, owners) {
  const horses = {};
  for (const fixture of horseFixtures) {
    const registrationNumber = 'HORSE-DEMO-' + String(fixture.no).padStart(2, '0');
    const payload = {
      owner_id: owners[fixture.owner].id,
      name: fixture.name,
      breed: fixture.breed,
      gender: fixture.no % 2 ? 'male' : 'female',
      date_of_birth: new Date(fixture.born + 'T00:00:00+07:00'),
      color: fixture.color,
      weight: fixture.weight,
      current_rating: 70 + (fixture.no % 5) * 5,
      health_status: 'fit',
      registration_number: registrationNumber,
      status: 'active'
    };
    const result = await models.Horse.findOrCreate({
      where: { registration_number: registrationNumber },
      defaults: payload
    });
    await result[0].update(payload);
    horses[fixture.no] = result[0];
  }
  return horses;
}

async function createParticipantFlow(models, context) {
  const {
    tournament,
    race,
    participantNumbers,
    horses,
    owners,
    jockeys,
    referee,
    admin,
    refereeUserId,
    tournamentNumber,
    raceNumber
  } = context;
  const entries = [];

  for (let slot = 1; slot <= participantNumbers.length; slot += 1) {
    const horse = horses[participantNumbers[slot - 1]];
    const owner = await models.HorseOwner.findByPk(horse.owner_id);
    const jockey = jockeys[slot];
    const registrationEligibility = evaluateHorseForRace(race, horse);
    if (registrationEligibility.status === ELIGIBILITY_STATUS.INELIGIBLE) {
      throw new Error('Invalid seeded horse for ' + race.name + ': ' + horse.name);
    }

    const registration = await models.Registration.create({
      tournament_id: tournament.id,
      race_id: race.id,
      horse_id: horse.id,
      owner_id: owner.id,
      horse_no: slot,
      draw: slot,
      rating_snapshot: horse.current_rating,
      declared_weight_kg: 54 + slot / 10,
      entry_finalized_at: now,
      entry_finalized_by: admin.id,
      status: 'approved',
      note: 'Seeded paid racetrack-eligible entry',
      entry_fee_vnd: race.entry_fee,
      entry_fee_token: 0,
      payment_status: 'paid',
      payment_method: 'VNPAY',
      payment_order_id: 'DEMO-2026-' + tournamentNumber + '-' + raceNumber + '-' + slot,
      gateway_reference_id: 'DEMO-VNPAY-2026-' + tournamentNumber + '-' + raceNumber + '-' + slot,
      payment_paid_at: now,
      slot_reserved: true,
      slot_reserved_at: now,
      registered_at: now,
      approved_by: admin.id,
      approved_at: now,
      eligibility_status: registrationEligibility.status,
      eligibility_snapshot: registrationEligibility,
      eligibility_checked_at: now
    });

    const assignment = await models.JockeyAssignment.create({
      race_id: race.id,
      horse_id: horse.id,
      owner_id: owner.id,
      jockey_id: jockey.id,
      assignment_type: 'primary',
      status: 'accepted',
      invitation_message: 'Demo invitation accepted and contract confirmed.',
      invited_at: addHours(now, -24),
      responded_at: addHours(now, -20)
    });
    await models.JockeyAssignmentMeeting.create({
      assignment_id: assignment.id,
      title: 'Demo pre-race meeting',
      meeting_time: addHours(race.race_date, -24),
      location_name: race.location,
      city: race.racetrack_id ? 'Vietnam' : null,
      accepted_at: addHours(now, -20)
    });
    await models.JockeyAssignmentTerm.create({
      assignment_id: assignment.id,
      agreed_terms: JSON.stringify({ fee_vnd: 5000000, transport: true }),
      agreed_at: addHours(now, -19),
      sent_at: addHours(now, -21),
      confirmed_at: addHours(now, -18),
      updated_by: admin.id
    });
    await models.JockeyAssignmentContract.create({
      assignment_id: assignment.id,
      contract_number: 'DEMO-CONTRACT-2026-' + tournamentNumber + '-' + raceNumber + '-' + slot,
      title: 'Primary jockey contract',
      file_url: 'https://example.com/demo-contract.pdf',
      file_type: 'application/pdf',
      file_name: 'demo-contract.pdf',
      signed_at: addHours(now, -17),
      uploaded_at: addHours(now, -17),
      confirmed_at: addHours(now, -16)
    });

    const requiresBallast = registrationEligibility.status === ELIGIBILITY_STATUS.CONDITIONAL_BALLAST;
    const horseCheckInput = {
      weight: horse.weight,
      ballast_added_kg: requiresBallast ? registrationEligibility.required_ballast_kg : 0,
      ballast_confirmed: requiresBallast
    };
    const preRaceEligibility = evaluatePreRaceEligibility(race, horse, horseCheckInput);
    if (preRaceEligibility.status !== ELIGIBILITY_STATUS.ELIGIBLE) {
      throw new Error('Invalid seeded pre-race check for ' + race.name + ': ' + horse.name);
    }
    await models.HorseCheck.create({
      race_id: race.id,
      horse_id: horse.id,
      jockey_id: jockey.id,
      referee_id: referee.id,
      phase: 'pre_race',
      status: 'passed',
      checklist: { identity: true, health: true, equipment: true, weight: true, eligibility: true },
      health_status: 'fit',
      weight: horse.weight,
      check_note: requiresBallast ? 'Ballast verified by referee.' : 'All racetrack requirements passed.',
      is_eligible: true,
      ballast_required_kg: requiresBallast ? registrationEligibility.required_ballast_kg : 0,
      ballast_added_kg: requiresBallast ? registrationEligibility.required_ballast_kg : 0,
      ballast_confirmed: requiresBallast,
      ballast_confirmed_by: requiresBallast ? refereeUserId : null,
      ballast_confirmed_at: requiresBallast ? now : null,
      eligibility_result: preRaceEligibility,
      checked_at: now
    });

    entries.push({ horse, owner, jockey, registration });
  }

  return entries;
}

async function createMarket(models, race, entries, adminUserId, completed, bettingOpen) {
  const market = await models.RaceOddsMarket.create({
    race_id: race.id,
    status: completed ? 'settled' : (bettingOpen ? 'open' : 'generated'),
    model_name: 'demo_probability_engine_v1',
    model_version: 'demo-2026.08',
    source: 'seedFullDemo',
    payout_factor: 0.85,
    model_input_version: 1,
    input_snapshot: { participant_count: entries.length, all_entries_have_primary_jockey: true },
    generated_by: adminUserId,
    generated_at: now,
    model_metrics: { brier_score: 0.142, calibration: 0.91 }
  });

  const oddsByHorse = {};
  for (let slot = 1; slot <= entries.length; slot += 1) {
    const probability = Number((0.30 - (slot - 1) * 0.035).toFixed(5));
    const fairOdds = Number((1 / probability).toFixed(2));
    const gameOdds = Number((fairOdds * 0.95).toFixed(2));
    const entry = entries[slot - 1];
    await models.RaceOddsMarketOdd.create({
      odds_market_id: market.id,
      horse_id: entry.horse.id,
      jockey_id: entry.jockey.id,
      horse_no: slot,
      horse_name: entry.horse.name,
      jockey_name: 'Demo Jockey ' + slot,
      win_probability: probability,
      fair_odds: fairOdds,
      game_odds: gameOdds,
      generated_game_odds: gameOdds,
      probability_rank: slot,
      fallbacks_used: []
    });
    oddsByHorse[entry.horse.id] = gameOdds;
  }
  return { market, oddsByHorse };
}

async function createCompletedRaceData(models, context) {
  const { race, tournament, entries, market, oddsByHorse, referee, admin, spectator } = context;
  const reportTime = addHours(race.race_date, 2);
  await models.RefereeReport.create({
    race_id: race.id,
    referee_id: referee.id,
    report_title: 'Official race report - Opening Stakes',
    report_content: 'All five horses passed their racetrack eligibility and post-race welfare checks.',
    race_condition: 'Normal',
    weather: 'Sunny',
    track_condition: 'Good',
    conclusion: 'Race valid. Results approved for publication and payout.',
    status: 'submitted',
    created_at: reportTime,
    submitted_at: addHours(reportTime, 1)
  });

  const results = [];
  for (let position = 1; position <= entries.length; position += 1) {
    const entry = entries[position - 1];
    await models.HorseCheck.create({
      race_id: race.id,
      horse_id: entry.horse.id,
      jockey_id: entry.jockey.id,
      referee_id: referee.id,
      phase: 'post_race',
      status: 'normal',
      checklist: { recovery: true, welfare: true },
      health_status: 'fit',
      weight: entry.horse.weight,
      check_note: 'Post-race check normal.',
      is_eligible: true,
      checked_at: addHours(reportTime, 1)
    });
    const result = await models.RaceResult.create({
      race_id: race.id,
      horse_id: entry.horse.id,
      jockey_id: entry.jockey.id,
      position,
      raw_position: position,
      final_position: position,
      finish_time: 70 + position * 0.8,
      raw_finish_time: 70 + position * 0.8,
      final_finish_time: 70 + position * 0.8,
      score: 100 - position * 5,
      raw_score: 100 - position * 5,
      final_score: 100 - position * 5,
      status: 'published',
      note: 'Published Phase 7 demo result',
      submitted_to_admin_by: admin.id,
      submitted_to_admin_at: addHours(reportTime, 1),
      recorded_by: referee.id,
      recorded_at: reportTime,
      confirmed_by: admin.id,
      confirmed_at: addHours(reportTime, 2),
      published_by: admin.id,
      published_at: addHours(reportTime, 2)
    });
    results.push(result);
  }

  const prizeAmounts = [20000000, 10000000, 5000000];
  for (let position = 1; position <= 3; position += 1) {
    const prize = await models.Prize.create({
      tournament_id: tournament.id,
      race_id: race.id,
      prize_name: 'Race prize - position ' + position,
      position,
      amount: prizeAmounts[position - 1],
      percent: [57.14, 28.57, 14.29][position - 1],
      currency: 'VND',
      description: 'Demo prize ready for payout'
    });
    const entry = entries[position - 1];
    await models.PrizeAward.create({
      prize_id: prize.id,
      race_result_id: results[position - 1].id,
      horse_id: entry.horse.id,
      owner_id: entry.owner.id,
      jockey_id: entry.jockey.id,
      position,
      amount: prize.amount,
      gross_amount: prize.amount,
      owner_amount: Number(prize.amount) * 0.8,
      jockey_amount: Number(prize.amount) * 0.2,
      currency: 'VND',
      status: 'paid',
      awarded_at: addHours(reportTime, 2),
      calculated_at: addHours(reportTime, 2),
      approved_at: addHours(reportTime, 2),
      approved_by: admin.id,
      paid_at: addHours(reportTime, 3),
      paid_by: admin.id
    });
  }

  const winner = entries[0];
  const winnerOdds = oddsByHorse[winner.horse.id];
  const stake = 500;
  const payout = Number((stake * winnerOdds).toFixed(2));
  await models.Bet.create({
    spectator_id: spectator.id,
    race_id: race.id,
    predicted_horse_id: winner.horse.id,
    stake_amount: stake,
    odds_market_id: market.id,
    potential_payout: payout,
    payout_amount: payout,
    status: 'won',
    settled_result_id: results[0].id,
    settled_by: admin.id,
    settled_at: addHours(reportTime, 2),
    submitted_at: race.race_date,
    checked_at: addHours(reportTime, 2),
    odds_snapshot: { horse_id: winner.horse.id, game_odds: winnerOdds, stake }
  });
}

async function createPendingBet(models, race, market, oddsByHorse, entry, spectatorId) {
  const stake = 500;
  const gameOdds = oddsByHorse[entry.horse.id];
  await models.Bet.create({
    spectator_id: spectatorId,
    race_id: race.id,
    predicted_horse_id: entry.horse.id,
    stake_amount: stake,
    odds_market_id: market.id,
    potential_payout: Number((stake * gameOdds).toFixed(2)),
    payout_amount: 0,
    status: 'pending',
    submitted_at: now,
    checked_at: now,
    odds_snapshot: { horse_id: entry.horse.id, game_odds: gameOdds, stake }
  });
}

async function main() {
  const sequelize = getSequelize();
  const { models } = loadSequelizeModels();
  await sequelize.authenticate();
  await resetTournamentData(sequelize);

  const users = await ensureBaseAccounts(models);
  const profiles = await ensureProfiles(models, users);
  const tracks = await ensureRacetracks(models, users.admin.id);
  const horses = await ensureHorses(models, profiles.owners);

  const existing = await models.Tournament.count({
    where: { name: DEMO_PREFIX + ' Cup 1 - Opening Stakes' }
  });
  if (existing) {
    console.log('Phase 7 demo pack already exists. No duplicate tournaments were created.');
    await sequelize.close();
    return;
  }

  let raceCount = 0;
  for (let tournamentIndex = 0; tournamentIndex < tournamentFixtures.length; tournamentIndex += 1) {
    const fixture = tournamentFixtures[tournamentIndex];
    const firstRace = raceTime(fixture, 0);
    const lastRace = raceTime(fixture, 2);
    const tournamentNumber = tournamentIndex + 1;
    const tournament = await models.Tournament.create({
      name: DEMO_PREFIX + ' Cup ' + tournamentNumber + ' - ' + fixture.title,
      description: 'Phase 7 full-flow demo: racetrack eligibility, registration, jockey assignment, odds, betting, referee checks, report and payout.',
      location: 'Vietnam racetrack circuit',
      start_date: firstRace,
      end_date: addHours(lastRace, 2),
      status: 'active',
      created_by: users.admin.id
    });
    const round = await models.Round.create({
      tournament_id: tournament.id,
      name: 'Main Round',
      round_order: 1,
      description: 'Three-race racetrack programme',
      status: 'published'
    });

    for (let raceIndex = 0; raceIndex < 3; raceIndex += 1) {
      const raceNumber = raceIndex + 1;
      const track = tracks[fixture.tracks[raceIndex]];
      const startingAt = raceTime(fixture, raceIndex);
      const completed = tournamentIndex === 0 && raceIndex === 0;
      const bettingOpen = !completed && raceIndex === 1;
      const referee = profiles.referees[((tournamentIndex + raceIndex) % 3) + 1];
      const race = await models.Race.create({
        tournament_id: tournament.id,
        round_id: round.id,
        name: 'Race ' + raceNumber + ' - ' + tournament.name,
        race_no: raceNumber,
        race_date: startingAt,
        starting_at: startingAt,
        distance: 1200 + raceNumber * 200,
        max_participants: 8,
        location: track.name,
        venue_code: track.code,
        racetrack_id: track.id,
        eligibility_rule_snapshot: snapshotFor(track),
        course: raceNumber === 2 ? 'B+2' : 'A',
        race_class: String(Math.min(5, raceNumber + 2)),
        going: 'Good',
        surface: 'Turf',
        referee_id: referee.id,
        registration_lock_at: addHours(startingAt, -1),
        registration_locked: completed,
        registration_slot_count: 5,
        registration_slots_initialized: true,
        status: completed ? 'completed' : 'scheduled',
        betting_status: completed ? 'settled' : (bettingOpen ? 'open' : 'unavailable'),
        betting_closes_at: addHours(startingAt, -1),
        entry_fee: 150000 + raceNumber * 25000,
        entry_fee_currency: 'VND',
        prize_pool: 30000000 + raceNumber * 5000000,
        prize_currency: 'VND'
      });
      const entries = await createParticipantFlow(models, {
        tournament,
        race,
        participantNumbers: participantNumbersByTrack[track.code],
        horses,
        owners: profiles.owners,
        jockeys: profiles.jockeys,
        referee,
        admin: users.admin,
        refereeUserId: referee.user_id,
        tournamentNumber,
        raceNumber
      });
      const marketData = await createMarket(models, race, entries, users.admin.id, completed, bettingOpen);
      if (completed) {
        await createCompletedRaceData(models, {
          race,
          tournament,
          entries,
          market: marketData.market,
          oddsByHorse: marketData.oddsByHorse,
          referee,
          admin: users.admin,
          spectator: users.spectator
        });
      } else {
        if (bettingOpen) {
          await createPendingBet(models, race, marketData.market, marketData.oddsByHorse, entries[0], users.spectator.id);
        }
        await models.RefereeReport.create({
          race_id: race.id,
          referee_id: referee.id,
          report_title: 'Pre-race referee briefing',
          report_content: 'Racetrack eligibility and participant documents have been reviewed.',
          race_condition: 'Scheduled',
          weather: 'To be confirmed',
          track_condition: 'Good',
          conclusion: 'Awaiting race start.',
          status: 'draft',
          created_at: now
        });
      }
      raceCount += 1;
    }
  }

  console.log('Seeded 5 tournaments, ' + raceCount + ' races through 2026-08-25, 75 valid registrations, 15 odds markets, referee reports, bets and completed payouts.');
  console.log('Demo login password: ' + PASSWORD);
  await sequelize.close();
}

main().catch(async (error) => {
  console.error('Full demo seed failed:', error);
  try {
    await getSequelize().close();
  } catch (_) {
    // Preserve the original failure.
  }
  process.exit(1);
});
