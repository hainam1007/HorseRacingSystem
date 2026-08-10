require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { hashPassword } = require('../utils/password');
const raceEntryService = require('../services/raceEntryService');
const {
  Horse,
  HorseOwner,
  Jockey,
  JockeyAssignment,
  Race,
  Registration,
  Role,
  Round,
  Tournament,
  User,
  UserRole
} = require('../models');

const PASSWORD = 'Password123';
const HORSES = [
  { name: 'Blue Point', number: 'ODDS-DEMO-001', rating: 62, gears: ['B'], weight: 54.0 },
  { name: 'Battaash', number: 'ODDS-DEMO-002', rating: 58, gears: ['TT'], weight: 54.5 },
  { name: 'Advertise', number: 'ODDS-DEMO-003', rating: 55, gears: [], weight: 53.5 },
  { name: 'Ten Sovereigns', number: 'ODDS-DEMO-004', rating: 51, gears: ['CP'], weight: 55.0 },
  { name: 'Dream Of Dreams', number: 'ODDS-DEMO-005', rating: 48, gears: ['V'], weight: 53.0 }
];
const JOCKEYS = [
  { name: 'James Doyle', email: 'oddsdemo.jockey1@racing.test', license: 'BHA-ODDS-J01', weight: 54.0 },
  { name: 'Oisin Murphy', email: 'oddsdemo.jockey2@racing.test', license: 'BHA-ODDS-J02', weight: 54.5 },
  { name: 'Ryan Moore', email: 'oddsdemo.jockey3@racing.test', license: 'BHA-ODDS-J03', weight: 53.5 },
  { name: 'William Buick', email: 'oddsdemo.jockey4@racing.test', license: 'BHA-ODDS-J04', weight: 55.0 },
  { name: 'Tom Marquand', email: 'oddsdemo.jockey5@racing.test', license: 'BHA-ODDS-J05', weight: 53.0 }
];

async function ensureRole(roleName) {
  return Role.findOneAndUpdate(
    { role_name: roleName },
    { $setOnInsert: { role_name: roleName, description: roleName + ' role' } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
}

async function ensureUser(email, fullName, roleName) {
  const [role, password] = await Promise.all([ensureRole(roleName), hashPassword(PASSWORD)]);
  const user = await User.findOneAndUpdate(
    { email: email },
    {
      full_name: fullName,
      email: email,
      password: password,
      status: 'active',
      email_verified: true,
      email_verified_at: new Date()
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );

  await UserRole.findOneAndUpdate(
    { user_id: user._id, role_id: role._id },
    { user_id: user._id, role_id: role._id },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
  return user;
}

async function run() {
  await connectDatabase();

  const admin = await ensureUser('oddsdemo.admin@racing.test', 'Arthur Pembroke', 'admin');
  const ownerUser = await ensureUser('oddsdemo.owner@racing.test', 'Margaret Hensley', 'horse_owner');
  const owner = await HorseOwner.findOneAndUpdate(
    { user_id: ownerUser._id },
    {
      user_id: ownerUser._id,
      stable_name: 'Hensley Park Racing',
      address: 'Newmarket, Suffolk',
      license_number: 'BHA-ODDS-O01',
      status: 'active'
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
  const jockeys = [];

  for (const data of JOCKEYS) {
    const user = await ensureUser(data.email, data.name, 'jockey');
    jockeys.push(await Jockey.findOneAndUpdate(
      { user_id: user._id },
      {
        user_id: user._id,
        weight_kg: data.weight,
        experience_years: 8,
        license_number: data.license,
        total_races: 180,
        total_wins: 35,
        disciplinary_status: 'clear',
        outstanding_fine_amount: 0,
        status: 'active'
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ));
  }

  const now = new Date();
  const tournament = await Tournament.findOneAndUpdate(
    { name: 'International Turf Analytics Meeting' },
    {
      name: 'International Turf Analytics Meeting',
      description: 'Model-input and pre-race odds demonstration meeting.',
      location: 'Sha Tin Racecourse',
      start_date: now,
      end_date: new Date(now.getTime() + 3 * 86400000),
      status: 'active',
      created_by: admin._id
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );
  const round = await Round.findOneAndUpdate(
    { tournament_id: tournament._id, round_order: 1 },
    {
      tournament_id: tournament._id,
      name: 'Probability Trial',
      round_order: 1,
      description: 'Five-runner field prepared for odds generation.',
      status: 'active'
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
  );
  const timestamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const race = await Race.create({
    tournament_id: tournament._id,
    round_id: round._id,
    name: 'Global Sprint Odds Trial ' + timestamp,
    race_no: 4,
    race_date: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    distance: 1200,
    max_participants: HORSES.length,
    location: 'Sha Tin Turf Course',
    venue_code: 'ST',
    course: 'B+2',
    race_class: '4',
    going: 'Good',
    surface: 'Turf',
    registration_locked: true,
    status: 'scheduled',
    betting_status: 'unavailable'
  });
  const horses = [];

  for (let index = 0; index < HORSES.length; index += 1) {
    const data = HORSES[index];
    const horse = await Horse.findOneAndUpdate(
      { registration_number: data.number },
      {
        owner_id: owner._id,
        name: data.name,
        registration_number: data.number,
        breed: 'Thoroughbred',
        gender: 'gelding',
        color: index === 2 ? 'grey' : 'bay',
        weight: 510 + (index * 3),
        current_rating: data.rating,
        default_gears: data.gears,
        health_status: 'fit',
        status: 'active'
      },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    );
    horses.push(horse);

    await Registration.create({
      tournament_id: tournament._id,
      race_id: race._id,
      horse_id: horse._id,
      owner_id: owner._id,
      declared_weight_kg: data.weight,
      gears: data.gears,
      status: 'approved',
      payment_status: 'paid',
      payment_method: 'VNPAY',
      payment_order_id: 'ODDS-SEED-' + race._id.toString() + '-' + (index + 1),
      gateway_reference_id: 'ODDS-VNPAY-' + race._id.toString() + '-' + (index + 1),
      payment_paid_at: now,
      approved_by: admin._id,
      approved_at: now
    });
    await JockeyAssignment.create({
      race_id: race._id,
      horse_id: horse._id,
      owner_id: owner._id,
      jockey_id: jockeys[index]._id,
      assignment_type: 'primary',
      status: 'accepted',
      invitation_message: 'Confirmed ride for the odds demonstration race.',
      contract: {
        contract_number: 'ODDS-CONTRACT-' + timestamp + '-' + (index + 1),
        title: data.name + ' riding agreement',
        file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/contracts/odds-' + (index + 1) + '.pdf',
        file_public_id: 'contracts/odds-' + timestamp + '-' + (index + 1),
        file_type: 'application/pdf',
        file_name: 'odds-contract-' + (index + 1) + '.pdf',
        signed_at: now,
        uploaded_at: now,
        confirmed_at: now
      },
      responded_at: now
    });
  }

  const finalized = await raceEntryService.finalizeEntries(admin._id, race._id);
  console.log(JSON.stringify({
    login: {
      admin_email: admin.email,
      password: PASSWORD
    },
    tournament_id: tournament._id.toString(),
    race_id: race._id.toString(),
    race_name: race.name,
    race_date: race.race_date,
    race_class: race.race_class,
    participants: finalized.readiness.participant_count,
    entries_finalized: finalized.readiness.entries_finalized,
    model_input_ready: finalized.readiness.ready,
    betting_status: race.betting_status,
    horses: finalized.readiness.participants.map(function(participant) {
      return {
        name: participant.horse_name,
        horse_no: participant.horse_no,
        draw: participant.draw,
        rating: participant.rating_snapshot,
        declared_weight_kg: participant.declared_weight_kg,
        gears: participant.gears,
        jockey: participant.primary_jockey && participant.primary_jockey.name
      };
    }),
    generate_odds_api: 'POST /api/races/' + race._id.toString() + '/odds/generate'
  }, null, 2));
}

run()
  .catch(function(error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async function() {
    await mongoose.disconnect();
  });
