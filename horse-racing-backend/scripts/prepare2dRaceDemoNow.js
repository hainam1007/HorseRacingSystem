require('dotenv').config();

const { connectDatabase } = require('../config/database');
const { Prize, Race } = require('../models');

const RACE_NAME = 'King Edward VII Stakes Demo';
const PRIZE_POOL = 100000000;
const PRIZE_CURRENCY = 'VND';
const PRIZE_DISTRIBUTION = [
  { position: 1, percent: 60, label: 'Winner' },
  { position: 2, percent: 20, label: 'Runner-up' },
  { position: 3, percent: 11, label: 'Third place' },
  { position: 4, percent: 6, label: 'Fourth place' },
  { position: 5, percent: 3, label: 'Fifth place' }
];

async function run() {
  await connectDatabase();

  const raceDate = new Date(Date.now() - 60 * 1000);
  const registrationLockAt = new Date(raceDate.getTime() - 3 * 60 * 60 * 1000);
  const race = await Race.findOneAndUpdate(
    { name: RACE_NAME },
    {
      race_date: raceDate,
      registration_lock_at: registrationLockAt,
      registration_locked: false,
      status: 'scheduled',
      prize_pool: PRIZE_POOL,
      prize_currency: PRIZE_CURRENCY,
      prize_distribution: PRIZE_DISTRIBUTION
    },
    { returnDocument: 'after', runValidators: true }
  ).populate('tournament_id');

  if (!race) {
    throw new Error('Demo race not found. Run npm.cmd run seed:demo:2d-race first.');
  }

  for (const item of PRIZE_DISTRIBUTION) {
    await Prize.findOneAndUpdate(
      { race_id: race._id, position: item.position },
      {
        tournament_id: race.tournament_id?._id || race.tournament_id,
        race_id: race._id,
        prize_name: 'Ascot Demo ' + item.label,
        position: item.position,
        percent: item.percent,
        amount: Math.round(PRIZE_POOL * item.percent / 100),
        currency: PRIZE_CURRENCY,
        description: item.label + ' prize for the 2D demo race.'
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );
  }

  const prizes = await Prize.find({ race_id: race._id }).sort({ position: 1 }).lean();

  console.log('2D demo race is ready now');
  console.log('Race:', race.name);
  console.log('Race ID:', race._id.toString());
  console.log('Race date:', race.race_date.toISOString());
  console.log('Status:', race.status);
  console.log('Registration locked:', race.registration_locked);
  console.log('Prize pool:', race.prize_pool, race.prize_currency);
  console.log('Prizes:', prizes.map(function(prize) {
    return prize.position + ':' + prize.amount + prize.currency;
  }).join(', '));
}

run()
  .catch(function(error) {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async function() {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
  });
