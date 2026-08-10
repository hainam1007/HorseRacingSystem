require('dotenv').config();

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const betService = require('../services/betService');
const raceEntryService = require('../services/raceEntryService');
const raceOddsService = require('../services/raceOddsService');
const raceResultService = require('../services/raceResultService');
const raceService = require('../services/raceService');
const {
  Bet,
  Horse,
  HorseOwner,
  HorseRatingHistory,
  Jockey,
  JockeyAssignment,
  Prize,
  PrizeAward,
  Race,
  RaceOddsMarket,
  RaceResult,
  Registration,
  Round,
  Tournament,
  TransactionHistory,
  User,
  Wallet
} = require('../models');

const prefix = 'e2e-model-bet-' + Date.now();
const ids = {
  users: [],
  owners: [],
  jockeys: [],
  horses: [],
  tournaments: [],
  rounds: [],
  races: [],
  registrations: [],
  assignments: []
};

function remember(kind, document) {
  if (document && document._id) ids[kind].push(document._id);
  return document;
}

async function createUser(label) {
  return remember('users', await User.create({
    full_name: prefix + ' ' + label,
    email: prefix + '-' + label.toLowerCase().replace(/\s+/g, '-') + '@example.com',
    password: 'e2e-only-password-hash',
    status: 'active',
    email_verified: true,
    email_verified_at: new Date()
  }));
}

async function seedFlowData() {
  const admin = await createUser('Admin');
  const ownerUser = await createUser('Owner');
  const spectator = await createUser('Spectator');
  const owner = remember('owners', await HorseOwner.create({
    user_id: ownerUser._id,
    stable_name: 'Kingsley Park',
    license_number: prefix + '-OWNER',
    status: 'active'
  }));
  const tournament = remember('tournaments', await Tournament.create({
    name: 'Summer Mile Championship ' + prefix,
    location: 'Sha Tin Racecourse',
    status: 'active',
    created_by: admin._id,
    start_date: new Date(Date.now() + 86400000),
    end_date: new Date(Date.now() + 3 * 86400000)
  }));
  const round = remember('rounds', await Round.create({
    tournament_id: tournament._id,
    name: 'Opening Round',
    round_order: 1,
    status: 'active'
  }));
  const race = remember('races', await Race.create({
    tournament_id: tournament._id,
    round_id: round._id,
    name: 'Summer Mile Trial',
    race_no: 3,
    race_date: new Date(Date.now() + 2 * 86400000),
    distance: 1600,
    max_participants: 6,
    location: 'Sha Tin Racecourse',
    venue_code: 'ST',
    course: 'B+2',
    race_class: '3',
    going: 'Good',
    surface: 'Turf',
    status: 'scheduled'
  }));
  const horseNames = ['Silver Birch', 'Highland Reel', 'Desert Crown', 'Golden Horn', 'Sea The Stars'];
  const gearSets = [['B'], ['TT'], [], ['CP'], ['V']];
  const participants = [];

  for (let index = 0; index < horseNames.length; index += 1) {
    const jockeyUser = await createUser('Jockey ' + (index + 1));
    const jockey = remember('jockeys', await Jockey.create({
      user_id: jockeyUser._id,
      license_number: prefix + '-JOCKEY-' + (index + 1),
      weight_kg: 52 + index,
      status: 'active'
    }));
    const horse = remember('horses', await Horse.create({
      owner_id: owner._id,
      name: horseNames[index],
      breed: 'Thoroughbred',
      current_rating: 48 + index,
      default_gears: gearSets[index],
      registration_number: prefix + '-HORSE-' + (index + 1),
      status: 'active'
    }));
    const registration = remember('registrations', await Registration.create({
      tournament_id: tournament._id,
      race_id: race._id,
      horse_id: horse._id,
      owner_id: owner._id,
      declared_weight_kg: 53 + (index * 0.5),
      gears: gearSets[index],
      status: 'approved',
      payment_status: 'paid',
      payment_method: 'VNPAY'
    }));
    const assignment = remember('assignments', await JockeyAssignment.create({
      race_id: race._id,
      horse_id: horse._id,
      owner_id: owner._id,
      jockey_id: jockey._id,
      assignment_type: 'primary',
      status: 'accepted'
    }));

    participants.push({ horse: horse, jockey: jockey, registration: registration, assignment: assignment });
  }

  await Wallet.create({ user_id: spectator._id, token_balance: 100 });
  return { admin: admin, spectator: spectator, race: race, participants: participants };
}

async function cleanup() {
  await HorseRatingHistory.deleteMany({ race_id: { $in: ids.races } });
  await PrizeAward.deleteMany({ race_result_id: { $in: await RaceResult.find({ race_id: { $in: ids.races } }).distinct('_id') } });
  await Prize.deleteMany({ race_id: { $in: ids.races } });
  await TransactionHistory.deleteMany({ user_id: { $in: ids.users } });
  await Bet.deleteMany({ race_id: { $in: ids.races } });
  await RaceOddsMarket.deleteMany({ race_id: { $in: ids.races } });
  await RaceResult.deleteMany({ race_id: { $in: ids.races } });
  await JockeyAssignment.deleteMany({ _id: { $in: ids.assignments } });
  await Registration.deleteMany({ _id: { $in: ids.registrations } });
  await Race.deleteMany({ _id: { $in: ids.races } });
  await Round.deleteMany({ _id: { $in: ids.rounds } });
  await Tournament.deleteMany({ _id: { $in: ids.tournaments } });
  await Horse.deleteMany({ _id: { $in: ids.horses } });
  await Jockey.deleteMany({ _id: { $in: ids.jockeys } });
  await HorseOwner.deleteMany({ _id: { $in: ids.owners } });
  await Wallet.deleteMany({ user_id: { $in: ids.users } });
  await User.deleteMany({ _id: { $in: ids.users } });
}

async function run() {
  try {
    await connectDatabase();
    const data = await seedFlowData();
    const finalized = await raceEntryService.finalizeEntries(data.admin._id, data.race._id);

    assert.equal(finalized.readiness.ready, true);
    assert.equal(finalized.readiness.participant_count, 5);
    assert.equal(new Set(finalized.entries.map(function(entry) { return entry.draw; })).size, 5);

    const generated = await raceOddsService.generateRaceOdds({ user: { _id: data.admin._id } }, data.race._id);
    assert.equal(generated.market.status, 'generated');
    assert.equal(generated.market.odds.length, 5);
    assert.ok(Math.abs(generated.market.odds.reduce(function(total, item) {
      return total + item.win_probability;
    }, 0) - 1) < 0.0001);
    assert.equal(generated.market.input_snapshot.horses[0].declared_weight, 116.84);

    const adjusted = await raceOddsService.updateRaceOdds(
      { user: { _id: data.admin._id } },
      data.race._id,
      {
        odds: generated.market.odds.map(function(item) {
          return {
            horse_id: item.horse_id._id || item.horse_id,
            game_odds: Number((item.game_odds + 0.1).toFixed(2))
          };
        }),
        adjustment_note: 'E2E final market review'
      }
    );
    assert.equal(adjusted.market.manual_adjustment_note, 'E2E final market review');
    assert.equal(adjusted.market.odds[0].generated_game_odds, generated.market.odds[0].game_odds);
    assert.equal(adjusted.market.odds[0].game_odds, Number((generated.market.odds[0].game_odds + 0.1).toFixed(2)));

    const opened = await raceService.openBetting(data.race._id, {
      min_stake: 1,
      max_stake: 100,
      currency: 'TOKEN'
    });
    assert.equal(opened.market.status, 'open');

    const selectedOdds = generated.market.odds[0];
    const placed = await betService.placeBet(
      { user: { _id: data.spectator._id } },
      {
        race_id: data.race._id,
        predicted_horse_id: selectedOdds.horse_id._id || selectedOdds.horse_id,
        stake_amount: 10
      }
    );
    assert.equal(placed.bet.status, 'pending');
    assert.equal(placed.wallet.token_balance, 90);

    const winningHorseId = (selectedOdds.horse_id._id || selectedOdds.horse_id).toString();
    const orderedParticipants = data.participants.slice().sort(function(first, second) {
      if (first.horse._id.toString() === winningHorseId) return -1;
      if (second.horse._id.toString() === winningHorseId) return 1;
      return first.horse.name.localeCompare(second.horse.name);
    });

    await RaceResult.create(orderedParticipants.map(function(participant, index) {
      const position = index + 1;
      const finishTime = 96 + (index * 0.7);
      return {
        race_id: data.race._id,
        horse_id: participant.horse._id,
        jockey_id: participant.jockey._id,
        position: position,
        raw_position: position,
        final_position: position,
        finish_time: finishTime,
        raw_finish_time: finishTime,
        final_finish_time: finishTime,
        score: 101 - position,
        raw_score: 101 - position,
        final_score: 101 - position,
        status: 'confirmed',
        confirmed_by: data.admin._id,
        confirmed_at: new Date()
      };
    }));

    const published = await raceResultService.publishRaceResults(data.admin._id, data.race._id);
    assert.equal(published.results.length, 5);
    assert.ok(published.results.every(function(result) { return result.status === 'published'; }));
    assert.equal(published.bet_settlement.won_count, 1);
    assert.equal(published.bet_settlement.lost_count, 0);
    assert.equal(published.rating_update.applied, true);
    assert.equal(published.rating_update.changes.length, 5);

    const [settledBet, wallet, settledMarket, ratingHistory, winningHorse] = await Promise.all([
      Bet.findById(placed.bet._id),
      Wallet.findOne({ user_id: data.spectator._id }),
      RaceOddsMarket.findOne({ race_id: data.race._id }),
      HorseRatingHistory.find({ race_id: data.race._id }),
      Horse.findById(winningHorseId)
    ]);
    const expectedBalance = Number((90 + placed.bet.potential_payout).toFixed(2));

    assert.equal(settledBet.status, 'won');
    assert.equal(wallet.token_balance, expectedBalance);
    assert.equal(settledMarket.status, 'settled');
    assert.equal(ratingHistory.length, 5);
    assert.ok(winningHorse.current_rating > 50);

    console.log('PASS - finalized 5 model-ready entries');
    console.log('PASS - probability engine generated normalized odds');
    console.log('PASS - spectator bet was deducted and settled as won');
    console.log('PASS - publish created 5 rating audit rows');
    console.log('SUMMARY: 4/4 passed');
  } catch (error) {
    console.error('E2E ERROR:', error && error.stack ? error.stack : error);
    if (error && error.details) console.error('E2E DETAILS:', JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error('CLEANUP ERROR:', error && error.stack ? error.stack : error);
      process.exitCode = 1;
    }
    await mongoose.disconnect();
  }
}

run();
