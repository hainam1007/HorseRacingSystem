require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const models = require('../models');
const adminDashboardService = require('../services/adminDashboardService');
const authService = require('../services/authService');

const DEMO_PASSWORD = 'Password123';
const ROLE_ACCOUNTS = [
  ['admin', 'admin@racing.test'],
  ['horse_owner', 'owner1@racing.test'],
  ['jockey', 'jockey1@racing.test'],
  ['race_referee', 'referee1@racing.test'],
  ['spectator', 'spectator1@racing.test']
];

async function summarizeRace(name) {
  const race = await models.Race.findOne({ name }).lean();

  if (!race) {
    return { name, found: false };
  }

  const [registrations, assignments, prechecks, oddsMarkets] = await Promise.all([
    models.Registration.countDocuments({ race_id: race._id }),
    models.JockeyAssignment.countDocuments({ race_id: race._id }),
    models.HorseCheck.countDocuments({ race_id: race._id, phase: 'pre_race' }),
    models.RaceOddsMarket.countDocuments({ race_id: race._id })
  ]);

  return {
    id: race._id.toString(),
    name: race.name,
    found: true,
    status: race.status,
    race_date: race.race_date,
    entry_fee_vnd: race.entry_fee || 0,
    max_participants: race.max_participants,
    registrations,
    assignments,
    prechecks,
    odds_markets: oddsMarkets
  };
}

async function run() {
  await connectDatabase();

  const accountChecks = await Promise.all(ROLE_ACCOUNTS.map(async function([role, email]) {
    try {
      const auth = await authService.login({ email, password: DEMO_PASSWORD });
      return {
        role,
        email,
        login: 'passed',
        assigned_roles: auth.roles
      };
    } catch (error) {
      return {
        role,
        email,
        login: 'failed',
        message: error.message
      };
    }
  }));
  const openOddsMarket = await models.RaceOddsMarket.findOne({ status: 'open' })
    .sort({ generated_at: -1 })
    .lean();
  const oddsRace = openOddsMarket
    ? await models.Race.findById(openOddsMarket.race_id).select('name race_date status betting_status').lean()
    : null;
  const [
    dashboard,
    race2d,
    openRegistration,
    users,
    tournaments,
    races,
    horses,
    registrations,
    assignments,
    checks,
    oddsMarkets,
    bets,
    depositPackages,
    depositRequests,
    rewards,
    cancellationTickets
  ] = await Promise.all([
    adminDashboardService.getDashboardSummary('2026-07-01', '2026-07-31'),
    summarizeRace('King Edward VII Stakes Demo'),
    summarizeRace('Independence Cup Open Entry Demo'),
    models.User.countDocuments(),
    models.Tournament.countDocuments(),
    models.Race.countDocuments(),
    models.Horse.countDocuments(),
    models.Registration.countDocuments(),
    models.JockeyAssignment.countDocuments(),
    models.HorseCheck.countDocuments(),
    models.RaceOddsMarket.countDocuments(),
    models.Bet.countDocuments(),
    models.DepositPackage.countDocuments(),
    models.DepositRequest.countDocuments(),
    models.RewardItem.countDocuments(),
    models.RegistrationCancellationTicket.countDocuments()
  ]);

  console.log(JSON.stringify({
    period: dashboard.period,
    account_checks: accountChecks,
    counts: {
      users,
      tournaments,
      races,
      horses,
      registrations,
      assignments,
      checks,
      odds_markets: oddsMarkets,
      bets,
      deposit_packages: depositPackages,
      deposit_requests: depositRequests,
      rewards,
      cancellation_tickets: cancellationTickets
    },
    dashboard: dashboard.metrics,
    demo_races: {
      referee_2d: race2d,
      open_registration: openRegistration,
      spectator_odds: openOddsMarket && oddsRace ? {
        id: oddsRace._id.toString(),
        name: oddsRace.name,
        race_date: oddsRace.race_date,
        race_status: oddsRace.status,
        betting_status: oddsRace.betting_status,
        participants: openOddsMarket.odds.length
      } : null
    }
  }, null, 2));
}

run()
  .catch(function(error) {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async function() {
    await mongoose.disconnect();
  });
