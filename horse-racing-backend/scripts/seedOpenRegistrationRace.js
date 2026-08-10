require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const {
  Horse,
  HorseCheck,
  Jockey,
  JockeyAssignment,
  Prize,
  Race,
  RaceEngineRun,
  RaceReferee,
  RaceResult,
  RaceRun,
  RefereeReport,
  Registration,
  Round,
  Tournament,
  User,
  Violation
} = require('../models');

const TOURNAMENT_NAME = 'Saigon International Demo Meeting';
const RACE_NAME = 'Independence Cup Open Entry Demo';
const ENTRY_FEE_VND = 50000;
const MAX_PARTICIPANTS = 6;
const SEEDED_PARTICIPANTS = 5;
const HORSE_REGISTRATION_NUMBERS = [
  'HR-THUNDER-001',
  'HR-SILVER-002',
  'HR-NIGHT-003',
  'HR-EMBER-004',
  'HR-RIVER-005'
];
const PRIZE_POOL = 60000000;
const PRIZE_DISTRIBUTION = [
  { position: 1, percent: 60, label: 'Winner' },
  { position: 2, percent: 25, label: 'Runner-up' },
  { position: 3, percent: 15, label: 'Third place' }
];

async function findExistingAdmin() {
  const preferredEmails = ['admin@racing.test', 'demo2d.admin@racing.test'];
  const admin = await User.findOne({ email: { $in: preferredEmails }, status: 'active' }).sort({ email: 1 });

  if (!admin) {
    throw new Error('No existing active demo admin found. Run the project seed first.');
  }

  return admin;
}

async function findExistingHorses() {
  const preferred = await Horse.find({
    registration_number: { $in: HORSE_REGISTRATION_NUMBERS },
    status: 'active'
  }).populate({
    path: 'owner_id',
    populate: { path: 'user_id', select: 'full_name email' }
  });
  const byNumber = new Map(preferred.map(function(horse) {
    return [horse.registration_number, horse];
  }));
  const horses = HORSE_REGISTRATION_NUMBERS.map(function(number) {
    return byNumber.get(number);
  }).filter(Boolean);

  if (horses.length < SEEDED_PARTICIPANTS) {
    const excludedIds = horses.map(function(horse) { return horse._id; });
    const fallback = await Horse.find({
      _id: { $nin: excludedIds },
      status: 'active'
    }).limit(SEEDED_PARTICIPANTS - horses.length).populate({
      path: 'owner_id',
      populate: { path: 'user_id', select: 'full_name email' }
    });
    horses.push(...fallback);
  }

  if (horses.length < SEEDED_PARTICIPANTS) {
    throw new Error('At least five existing active horses are required. No horse will be created by this script.');
  }

  return horses.slice(0, SEEDED_PARTICIPANTS);
}

async function findExistingJockeys() {
  const jockeys = await Jockey.find({ status: 'active' })
    .populate('user_id', 'full_name email')
    .sort({ total_wins: -1, total_races: -1, _id: 1 })
    .limit(SEEDED_PARTICIPANTS);

  if (jockeys.length < SEEDED_PARTICIPANTS) {
    throw new Error('At least five existing active jockeys are required. No jockey will be created by this script.');
  }

  return jockeys;
}

async function clearRaceFlow(raceId) {
  await Promise.all([
    HorseCheck.deleteMany({ race_id: raceId }),
    JockeyAssignment.deleteMany({ race_id: raceId }),
    Registration.deleteMany({ race_id: raceId }),
    RaceEngineRun.deleteMany({ race_id: raceId }),
    RaceRun.deleteMany({ race_id: raceId }),
    RaceResult.deleteMany({ race_id: raceId }),
    RefereeReport.deleteMany({ race_id: raceId }),
    Violation.deleteMany({ race_id: raceId }),
    Prize.deleteMany({ race_id: raceId })
  ]);
}

async function run() {
  await connectDatabase();

  const [admin, referee, horses, jockeys] = await Promise.all([
    findExistingAdmin(),
    RaceReferee.findOne({ status: 'active' }).populate('user_id', 'full_name email'),
    findExistingHorses(),
    findExistingJockeys()
  ]);

  if (!referee) {
    throw new Error('No existing active referee found. Run the project seed first.');
  }

  const now = new Date();
  const raceDate = new Date(now.getTime() - 60 * 1000);
  const registrationLockAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tournament = await Tournament.findOneAndUpdate(
    { name: TOURNAMENT_NAME },
    {
      name: TOURNAMENT_NAME,
      description: 'Open-entry demo meeting using existing owners, horses, jockeys and referee accounts.',
      location: 'Phu Tho Racecourse, Ho Chi Minh City',
      start_date: now,
      end_date: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: 'active',
      created_by: admin._id
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );
  const round = await Round.findOneAndUpdate(
    { tournament_id: tournament._id, round_order: 1 },
    {
      tournament_id: tournament._id,
      name: 'Open Sprint Final',
      round_order: 1,
      description: 'Single-race demo round with one open owner entry.',
      status: 'active'
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );
  const race = await Race.findOneAndUpdate(
    { tournament_id: tournament._id, name: RACE_NAME },
    {
      tournament_id: tournament._id,
      round_id: round._id,
      referee_id: referee._id,
      name: RACE_NAME,
      race_date: raceDate,
      distance: 1200,
      max_participants: MAX_PARTICIPANTS,
      location: 'Phu Tho Turf Course',
      registration_locked: false,
      status: 'scheduled',
      betting_status: 'unavailable',
      prize_pool: PRIZE_POOL,
      prize_currency: 'VND',
      entry_fee: ENTRY_FEE_VND,
      entry_fee_currency: 'VND',
      prize_distribution: PRIZE_DISTRIBUTION
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );

  // Deliberate demo override: registrations remain open while race_date is already startable.
  await Race.collection.updateOne(
    { _id: race._id },
    { $set: { registration_lock_at: registrationLockAt, registration_locked: false } }
  );
  await clearRaceFlow(race._id);

  for (let index = 0; index < SEEDED_PARTICIPANTS; index += 1) {
    const horse = horses[index];
    const jockey = jockeys[index];
    const owner = horse.owner_id;

    if (!owner || !owner._id) {
      throw new Error('Horse ' + horse.name + ' does not have a valid existing owner profile.');
    }

    await Registration.create({
      tournament_id: tournament._id,
      race_id: race._id,
      horse_id: horse._id,
      owner_id: owner._id,
      status: 'approved',
      note: 'Existing paid entry prepared for the open-registration demo.',
      admin_note: 'Seeded as paid through VNPay for demo setup.',
      entry_fee_vnd: ENTRY_FEE_VND,
      entry_fee_token: 0,
      payment_status: 'paid',
      payment_method: 'VNPAY',
      payment_order_id: 'REG-SEED-' + race._id.toString() + '-' + String(index + 1),
      gateway_reference_id: 'VNPAY-SEED-' + String(index + 1).padStart(2, '0'),
      payment_paid_at: new Date(now.getTime() - 30 * 60 * 1000),
      approved_by: admin._id,
      approved_at: new Date(now.getTime() - 30 * 60 * 1000)
    });

    await JockeyAssignment.create({
      race_id: race._id,
      horse_id: horse._id,
      owner_id: owner._id,
      jockey_id: jockey._id,
      assignment_type: 'primary',
      status: 'accepted',
      invitation_message: 'Confirmed existing ride for the open-entry demo race.',
      contract: {
        contract_number: 'DEMO-OPEN-' + String(index + 1).padStart(2, '0'),
        title: horse.name + ' riding agreement',
        file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/contracts/open-entry-' + String(index + 1) + '.pdf',
        file_public_id: 'contracts/open-entry-' + String(index + 1),
        file_type: 'application/pdf',
        file_name: 'open-entry-' + String(index + 1) + '.pdf',
        signed_at: new Date(now.getTime() - 45 * 60 * 1000),
        uploaded_at: new Date(now.getTime() - 40 * 60 * 1000),
        confirmed_at: new Date(now.getTime() - 35 * 60 * 1000)
      },
      responded_at: new Date(now.getTime() - 35 * 60 * 1000)
    });
  }

  for (const item of PRIZE_DISTRIBUTION) {
    await Prize.create({
      tournament_id: tournament._id,
      race_id: race._id,
      prize_name: RACE_NAME + ' - ' + item.label,
      position: item.position,
      percent: item.percent,
      amount: Math.round(PRIZE_POOL * item.percent / 100),
      currency: 'VND',
      description: item.label + ' prize for the open-entry demo race.'
    });
  }

  const finalRace = await Race.findById(race._id).lean();
  const participantCount = await Registration.countDocuments({ race_id: race._id, status: 'approved' });

  console.log(JSON.stringify({
    tournament_id: tournament._id.toString(),
    tournament_name: tournament.name,
    race_id: race._id.toString(),
    race_name: race.name,
    race_date: finalRace.race_date,
    registration_lock_at: finalRace.registration_lock_at,
    entry_fee_vnd: finalRace.entry_fee,
    participants: participantCount,
    max_participants: finalRace.max_participants,
    referee: referee.user_id ? referee.user_id.email : referee._id.toString(),
    horses: horses.map(function(horse, index) {
      return {
        name: horse.name,
        registration_number: horse.registration_number,
        owner: horse.owner_id && horse.owner_id.user_id ? horse.owner_id.user_id.email : horse.owner_id._id.toString(),
        jockey: jockeys[index].user_id ? jockeys[index].user_id.email : jockeys[index]._id.toString()
      };
    })
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
