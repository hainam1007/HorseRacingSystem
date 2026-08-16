/**
 * Seed a complete, repeatable demo pack for the horse-racing flow.
 *
 * Usage:
 *   node scripts/seedFullDemo.js
 *
 * The pack is intentionally additive.  A tournament with the same demo name
 * is not recreated, so it is safe to run this script more than once.
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { getSequelize } = require('../config/sequelize');
const { loadSequelizeModels } = require('../models/sequelize');

const PASSWORD = 'Password123';
const DEMO_PREFIX = 'DEMO 2026';
const now = new Date();
const iso = (date) => new Date(date).toISOString();
const addHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);
const addDays = (date, days) => addHours(date, days * 24);
const id = () => require('crypto').randomUUID();

const roles = [
  ['admin', 'System administrator'],
  ['horse_owner', 'Horse owner'],
  ['jockey', 'Jockey'],
  ['race_referee', 'Race referee'],
  ['spectator', 'Spectator'],
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
  { key: 'spectator', name: 'Demo Spectator', email: 'demo.spectator@racing.test', role: 'spectator' },
];

async function main() {
  const sequelize = getSequelize();
  const { models } = loadSequelizeModels();
  await sequelize.authenticate();

  const roleMap = {};
  for (const [role_name, description] of roles) {
    const [role] = await models.Role.findOrCreate({ where: { role_name }, defaults: { role_name, description } });
    roleMap[role_name] = role;
  }

  const users = {};
  for (const account of accounts) {
    const [user] = await models.User.findOrCreate({
      where: { email: account.email },
      defaults: {
        full_name: account.name,
        email: account.email,
        password: bcrypt.hashSync(PASSWORD, 10),
        status: 'active',
        email_verified: true,
        email_verified_at: now,
      },
    });
    users[account.key] = user;
    await models.UserRole.findOrCreate({ where: { user_id: user.id, role_id: roleMap[account.role].id }, defaults: { user_id: user.id, role_id: roleMap[account.role].id } });
  }

  const ownerProfiles = {};
  for (let i = 1; i <= 5; i += 1) {
    const [profile] = await models.HorseOwner.findOrCreate({
      where: { user_id: users[`owner${i}`].id },
      defaults: { user_id: users[`owner${i}`].id, stable_name: `Demo Stable ${i}`, address: 'Ho Chi Minh City', license_number: `OWNER-DEMO-${i}`, status: 'active' },
    });
    ownerProfiles[i] = profile;
  }

  const jockeyProfiles = {};
  for (let i = 1; i <= 5; i += 1) {
    const [profile] = await models.Jockey.findOrCreate({
      where: { user_id: users[`jockey${i}`].id },
      defaults: { user_id: users[`jockey${i}`].id, height: 165 + i, weight_kg: 52 + i, experience_years: 4 + i, license_number: `JOCKEY-DEMO-${i}`, total_races: 80 + i * 10, total_wins: 15 + i, status: 'active', disciplinary_status: 'clear' },
    });
    jockeyProfiles[i] = profile;
  }

  const refereeProfiles = {};
  for (let i = 1; i <= 3; i += 1) {
    const [profile] = await models.RaceReferee.findOrCreate({
      where: { user_id: users[`referee${i}`].id },
      defaults: { user_id: users[`referee${i}`].id, license_number: `REF-DEMO-${i}`, experience_years: 8 + i, status: 'active' },
    });
    refereeProfiles[i] = profile;
  }

  const spectatorWallet = await models.Wallet.findOrCreate({ where: { user_id: users.spectator.id }, defaults: { user_id: users.spectator.id, token_balance: 50000 } });
  if (Number(spectatorWallet[0].token_balance) < 5000) await spectatorWallet[0].update({ token_balance: 50000 });

  const horses = [];
  for (let i = 1; i <= 15; i += 1) {
    const ownerNo = ((i - 1) % 5) + 1;
    const [horse] = await models.Horse.findOrCreate({
      where: { registration_number: `HORSE-DEMO-${String(i).padStart(2, '0')}` },
      defaults: { owner_id: ownerProfiles[ownerNo].id, name: ['Azure Comet', 'Golden Hoof', 'Mekong Star', 'Royal Breeze', 'Silver Arrow'][ownerNo - 1] + ` ${Math.ceil(i / 5)}`, breed: 'Thoroughbred', gender: i % 2 ? 'male' : 'female', date_of_birth: addDays(now, -1700 - i * 20), color: ['Bay', 'Chestnut', 'Black', 'Grey', 'Brown'][ownerNo - 1], weight: 485 + i, current_rating: 72 + (i % 5) * 6, health_status: 'fit', registration_number: `HORSE-DEMO-${String(i).padStart(2, '0')}`, status: 'active' },
    });
    horses.push(horse);
  }

  const existingDemo = await models.Tournament.findOne({ where: { name: `${DEMO_PREFIX} Cup 1 - Opening Stakes` } });
  if (existingDemo) {
    console.log('Demo pack already exists. Nothing was duplicated.');
    await sequelize.close();
    return;
  }

  const raceTimes = Array.from({ length: 15 }, (_, i) => addHours(now, 2 + i * 8.5));
  const tournaments = [];
  const allRaces = [];
  for (let t = 1; t <= 5; t += 1) {
    const tournament = await models.Tournament.create({ name: `${DEMO_PREFIX} Cup ${t} - ${['Opening Stakes', 'Mekong Classic', 'Saigon Derby', 'Heritage Sprint', 'Grand Finale'][t - 1]}`, description: 'Full-flow demo tournament: registration, jockey assignment, odds, betting, referee checks, result and payout.', location: 'Saigon Racing Park', start_date: raceTimes[(t - 1) * 3], end_date: addHours(raceTimes[(t - 1) * 3], 20), status: 'active', created_by: users.admin.id });
    tournaments.push(tournament);
    const round = await models.Round.create({ tournament_id: tournament.id, name: 'Main Round', round_order: 1, description: 'Three-race demo programme', status: 'published' });

    for (let r = 1; r <= 3; r += 1) {
      const index = (t - 1) * 3 + r - 1;
      const isPublishedDemo = t === 3 && r === 3;
      const bettingOpen = !isPublishedDemo && (r === 1 || t === 1);
      const race = await models.Race.create({
        tournament_id: tournament.id, round_id: round.id, name: `Race ${r} - ${tournament.name}`, race_no: r,
        race_date: raceTimes[index], starting_at: raceTimes[index], distance: 1200 + r * 200, max_participants: 8,
        location: 'Saigon Racing Park', venue_code: `SGP-${t}${r}`, course: r === 2 ? 'B+2' : 'A', race_class: String(Math.min(5, r + 2)), going: 'Good', surface: 'Turf',
        referee_id: refereeProfiles[((t + r - 2) % 3) + 1].id, registration_lock_at: addHours(raceTimes[index], -1), registration_locked: isPublishedDemo,
        registration_slot_count: 5, registration_slots_initialized: true, status: isPublishedDemo ? 'completed' : 'scheduled',
        betting_status: isPublishedDemo ? 'settled' : (bettingOpen ? 'open' : 'unavailable'), betting_closes_at: addHours(raceTimes[index], -1),
        entry_fee: 150000 + r * 25000, entry_fee_currency: 'VND', prize_pool: 30000000 + r * 5000000, prize_currency: 'VND',
      });
      allRaces.push({ race, tournament, isPublishedDemo, bettingOpen });

      const entries = [];
      for (let slot = 1; slot <= 5; slot += 1) {
        const horse = horses[(index * 5 + slot - 1) % horses.length];
        const owner = ownerProfiles[((index * 5 + slot - 1) % 5) + 1];
        const jockey = jockeyProfiles[((index * 5 + slot - 1) % 5) + 1];
        const registration = await models.Registration.create({ tournament_id: tournament.id, race_id: race.id, horse_id: horse.id, owner_id: owner.id, horse_no: slot, draw: slot, rating_snapshot: horse.current_rating, declared_weight_kg: 54 + slot / 10, entry_finalized_at: now, entry_finalized_by: users.admin.id, status: 'approved', note: 'Seeded paid demo entry', entry_fee_vnd: race.entry_fee, entry_fee_token: 0, payment_status: 'paid', payment_method: 'VNPAY', payment_order_id: `DEMO-${t}-${r}-${slot}`, gateway_reference_id: `DEMO-VNPAY-${t}-${r}-${slot}`, payment_paid_at: now, slot_reserved: true, slot_reserved_at: now, registered_at: now, approved_by: users.admin.id, approved_at: now });
        entries.push({ horse, owner, jockey, registration });
        const assignment = await models.JockeyAssignment.create({ race_id: race.id, horse_id: horse.id, owner_id: owner.id, jockey_id: jockey.id, assignment_type: 'primary', status: 'accepted', invitation_message: 'Demo invitation accepted and contract confirmed.', invited_at: addHours(now, -24), responded_at: addHours(now, -20) });
        await models.JockeyAssignmentMeeting.create({ assignment_id: assignment.id, title: 'Demo pre-race meeting', meeting_time: addHours(raceTimes[index], -24), location_name: 'Saigon Racing Park', city: 'Ho Chi Minh City', accepted_at: addHours(now, -20) });
        await models.JockeyAssignmentTerm.create({ assignment_id: assignment.id, agreed_terms: JSON.stringify({ fee_vnd: 5000000, transport: true }), agreed_at: addHours(now, -19), sent_at: addHours(now, -21), confirmed_at: addHours(now, -18), updated_by: users.admin.id });
        await models.JockeyAssignmentContract.create({ assignment_id: assignment.id, contract_number: `DEMO-CONTRACT-${t}-${r}-${slot}`, title: 'Primary jockey contract', file_url: 'https://example.com/demo-contract.pdf', file_type: 'application/pdf', file_name: 'demo-contract.pdf', signed_at: addHours(now, -17), uploaded_at: addHours(now, -17), confirmed_at: addHours(now, -16) });
        await models.HorseCheck.create({ race_id: race.id, horse_id: horse.id, jockey_id: jockey.id, referee_id: race.referee_id, phase: 'pre_race', status: 'passed', checklist: { identity: true, health: true, equipment: true, weight: true, eligibility: true }, health_status: 'fit', weight: horse.weight, check_note: 'All requirements passed.', is_eligible: true, checked_at: now });
        if (isPublishedDemo) await models.HorseCheck.create({ race_id: race.id, horse_id: horse.id, jockey_id: jockey.id, referee_id: race.referee_id, phase: 'post_race', status: 'normal', checklist: { recovery: true, welfare: true }, health_status: 'fit', weight: horse.weight, check_note: 'Post-race check normal.', is_eligible: true, checked_at: now });
      }

      const market = await models.RaceOddsMarket.create({ race_id: race.id, status: isPublishedDemo ? 'settled' : (bettingOpen ? 'open' : 'generated'), model_name: 'demo_probability_engine_v1', model_version: 'demo-2026.08', source: 'seedFullDemo', payout_factor: 0.85, model_input_version: 1, input_snapshot: { participant_count: 5, all_entries_have_primary_jockey: true }, generated_by: users.admin.id, generated_at: now, model_metrics: { brier_score: 0.142, calibration: 0.91 } });
      for (let slot = 1; slot <= 5; slot += 1) {
        const entry = entries[slot - 1];
        const probability = Number((0.30 - (slot - 1) * 0.035).toFixed(5));
        const fairOdds = Number((1 / probability).toFixed(2));
        await models.RaceOddsMarketOdd.create({ odds_market_id: market.id, horse_id: entry.horse.id, jockey_id: entry.jockey.id, horse_no: slot, horse_name: entry.horse.name, jockey_name: (await entry.jockey.getUser()).full_name, win_probability: probability, fair_odds: fairOdds, game_odds: Number((fairOdds * 0.95).toFixed(2)), generated_game_odds: Number((fairOdds * 0.95).toFixed(2)), probability_rank: slot, fallbacks_used: [] });
      }

      if (r === 1 || isPublishedDemo) {
        const target = entries[0];
        await models.Bet.create({ spectator_id: users.spectator.id, race_id: race.id, predicted_horse_id: target.horse.id, stake_amount: 500, odds_market_id: market.id, potential_payout: isPublishedDemo ? 712.5 : 750, payout_amount: isPublishedDemo ? 712.5 : 0, status: isPublishedDemo ? 'won' : 'pending', settled_at: isPublishedDemo ? now : null, submitted_at: now, checked_at: now, odds_snapshot: { horse_id: target.horse.id, game_odds: isPublishedDemo ? 1.425 : 1.5, stake: 500 } });
      }

      if (isPublishedDemo) {
        const report = await models.RefereeReport.create({ race_id: race.id, referee_id: race.referee_id, report_title: 'Official race report - demo final', report_content: 'All five horses passed pre-race and post-race checks. The race was completed without unresolved violations.', race_condition: 'Normal', weather: 'Sunny', track_condition: 'Good', conclusion: 'Race valid. Results recommended for publication and payout.', status: 'submitted', created_at: addHours(now, -3), submitted_at: addHours(now, -2) });
        const ordered = [0, 1, 2, 3, 4];
        for (let pos = 1; pos <= 5; pos += 1) {
          const entry = entries[ordered[pos - 1]];
          await models.RaceResult.create({ race_id: race.id, horse_id: entry.horse.id, jockey_id: entry.jockey.id, position: pos, raw_position: pos, final_position: pos, finish_time: 70 + pos * 0.8, raw_finish_time: 70 + pos * 0.8, final_finish_time: 70 + pos * 0.8, score: 100 - pos * 5, raw_score: 100 - pos * 5, final_score: 100 - pos * 5, status: 'published', note: 'Published demo result', submitted_to_admin_by: users.admin.id, submitted_to_admin_at: addHours(now, -2), recorded_by: race.referee_id, recorded_at: addHours(now, -4), confirmed_by: users.admin.id, confirmed_at: addHours(now, -1), published_by: users.admin.id, published_at: now });
        }
        const prizes = [];
        for (let pos = 1; pos <= 3; pos += 1) prizes.push(await models.Prize.create({ tournament_id: tournament.id, race_id: race.id, prize_name: `Race ${r} prize - position ${pos}`, position: pos, amount: [20000000, 10000000, 5000000][pos - 1], percent: [57.14, 28.57, 14.29][pos - 1], currency: 'VND', description: 'Demo prize ready for payout' }));
        const results = await models.RaceResult.findAll({ where: { race_id: race.id }, order: [['final_position', 'ASC']] });
        for (let pos = 1; pos <= 3; pos += 1) { const result = results[pos - 1]; const entry = entries.find((e) => e.horse.id === result.horse_id); await models.PrizeAward.create({ prize_id: prizes[pos - 1].id, race_result_id: result.id, horse_id: entry.horse.id, owner_id: entry.owner.id, jockey_id: entry.jockey.id, position: pos, amount: prizes[pos - 1].amount, gross_amount: prizes[pos - 1].amount, owner_amount: Number(prizes[pos - 1].amount) * 0.8, jockey_amount: Number(prizes[pos - 1].amount) * 0.2, currency: 'VND', status: 'paid', awarded_at: now, calculated_at: now, approved_at: now, approved_by: users.admin.id, paid_at: now, paid_by: users.admin.id }); }
      }
    }
  }

  console.log(`Seeded ${tournaments.length} tournaments, ${allRaces.length} races, 75 paid registrations, 75 jockey assignments and odds markets.`);
  console.log(`Demo login password: ${PASSWORD}`);
  console.log(`Admin: ${users.admin.email} | Spectator: ${users.spectator.email}`);
  console.log(`Race window: ${iso(raceTimes[0])} -> ${iso(raceTimes[14])}`);
  await sequelize.close();
}

main().catch(async (error) => { console.error('Full demo seed failed:', error); try { await getSequelize().close(); } catch (_) {} process.exit(1); });
