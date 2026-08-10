require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { hashPassword } = require('../utils/password');
const {
  Horse,
  HorseCheck,
  HorseOwner,
  Jockey,
  JockeyAssignment,
  Race,
  RaceResult,
  RaceReferee,
  RaceRun,
  Prize,
  RefereeReport,
  Registration,
  Role,
  Round,
  Tournament,
  User,
  UserRole,
  Violation
} = require('../models');

const PASSWORD = 'Password123';
const now = Date.now();

const COLORS = ['bay', 'chestnut', 'grey', 'dark bay', 'black', 'roan'];
const HORSES = [
  { name: 'Crown Sovereign', number: '2D-ASCOT-001', breed: 'Thoroughbred', gender: 'stallion', color: 'bay', weight: 520 },
  { name: 'Northern Valor', number: '2D-ASCOT-002', breed: 'Thoroughbred', gender: 'gelding', color: 'chestnut', weight: 514 },
  { name: 'Silver Meridian', number: '2D-ASCOT-003', breed: 'Thoroughbred', gender: 'mare', color: 'grey', weight: 505 },
  { name: 'Kingston Arrow', number: '2D-ASCOT-004', breed: 'Thoroughbred', gender: 'stallion', color: 'dark bay', weight: 522 },
  { name: 'Valiant Echo', number: '2D-ASCOT-005', breed: 'Thoroughbred', gender: 'gelding', color: 'black', weight: 516 }
];
const JOCKEYS = [
  { name: 'Oliver Harrington', email: 'demo2d.jockey1@racing.test', license: 'BHA-J-2401', height: 168, weight: 54, wins: 48 },
  { name: 'James Whitaker', email: 'demo2d.jockey2@racing.test', license: 'BHA-J-2402', height: 170, weight: 55, wins: 42 },
  { name: 'Ethan Calloway', email: 'demo2d.jockey3@racing.test', license: 'BHA-J-2403', height: 166, weight: 53, wins: 57 },
  { name: 'Lucas Fairchild', email: 'demo2d.jockey4@racing.test', license: 'BHA-J-2404', height: 171, weight: 56, wins: 31 },
  { name: 'Henry Beaumont', email: 'demo2d.jockey5@racing.test', license: 'BHA-J-2405', height: 167, weight: 54, wins: 39 },
  { name: 'Samuel Kingsley', email: 'demo2d.jockey6@racing.test', license: 'BHA-J-2406', height: 169, weight: 55, wins: 44 }
];
const PRIZE_POOL = 100000000;
const PRIZE_CURRENCY = 'VND';
const PRIZE_DISTRIBUTION = [
  { position: 1, percent: 60, label: 'Winner' },
  { position: 2, percent: 20, label: 'Runner-up' },
  { position: 3, percent: 11, label: 'Third place' },
  { position: 4, percent: 6, label: 'Fourth place' },
  { position: 5, percent: 3, label: 'Fifth place' }
];
async function ensureRole(roleName) {
  return Role.findOneAndUpdate(
    { role_name: roleName },
    { $setOnInsert: { role_name: roleName, description: roleName + ' demo role' } },
    { upsert: true, new: true, runValidators: true }
  );
}

async function ensureUser(email, fullName, roleName) {
  const role = await ensureRole(roleName);
  const password = await hashPassword(PASSWORD);
  const user = await User.findOneAndUpdate(
    { email },
    {
      full_name: fullName,
      email,
      password,
      status: 'active',
      email_verified: true,
      email_verified_at: new Date()
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await UserRole.findOneAndUpdate(
    { user_id: user._id, role_id: role._id },
    { user_id: user._id, role_id: role._id },
    { upsert: true, new: true, runValidators: true }
  );

  return user;
}

async function seed() {
  await connectDatabase();

  const admin = await ensureUser('demo2d.admin@racing.test', 'Charles Ashford', 'admin');
  const ownerUser = await ensureUser('demo2d.owner@racing.test', 'Eleanor Whitmore', 'horse_owner');
  const refereeUser = await ensureUser('demo2d.referee@racing.test', 'William P. Hargreaves', 'race_referee');
  const spectatorUser = await ensureUser('demo2d.spectator@racing.test', 'Thomas Ellison', 'spectator');
  const owner = await HorseOwner.findOneAndUpdate(
    { user_id: ownerUser._id },
    {
      user_id: ownerUser._id,
      stable_name: 'Whitmore Racing Stables',
      address: 'Newmarket, Suffolk',
      license_number: 'BHA-O-1847',
      status: 'active'
    },
    { upsert: true, new: true, runValidators: true }
  );
  const referee = await RaceReferee.findOneAndUpdate(
    { user_id: refereeUser._id },
    {
      user_id: refereeUser._id,
      license_number: 'BHA-R-0921',
      experience_years: 16,
      status: 'active'
    },
    { upsert: true, new: true, runValidators: true }
  );
  const jockeyProfiles = [];

  for (const data of JOCKEYS) {
    const user = await ensureUser(data.email, data.name, 'jockey');
    const jockey = await Jockey.findOneAndUpdate(
      { user_id: user._id },
      {
        user_id: user._id,
        height: data.height,
        weight: data.weight,
        experience_years: 8,
        license_number: data.license,
        total_races: 180,
        total_wins: data.wins,
        disciplinary_status: 'clear',
        outstanding_fine_amount: 0,
        status: 'active'
      },
      { upsert: true, new: true, runValidators: true }
    );

    jockeyProfiles.push(jockey);
  }

  const tournament = await Tournament.findOneAndUpdate(
    { name: 'Royal Ascot International Sprint' },
    {
      name: 'Royal Ascot International Sprint',
      description: 'Demo sprint card prepared for the 2D race viewer.',
      location: 'Ascot Racecourse, Berkshire',
      start_date: new Date(now - 86400000),
      end_date: new Date(now + 86400000),
      status: 'active',
      created_by: admin._id
    },
    { upsert: true, new: true, runValidators: true }
  );
  const round = await Round.findOneAndUpdate(
    { tournament_id: tournament._id, round_order: 1 },
    {
      tournament_id: tournament._id,
      name: 'Group One Feature',
      round_order: 1,
      description: 'Six-furlong international sprint.',
      status: 'active'
    },
    { upsert: true, new: true, runValidators: true }
  );
  const race = await Race.findOneAndUpdate(
    { tournament_id: tournament._id, name: 'King Edward VII Stakes Demo' },
    {
      tournament_id: tournament._id,
      round_id: round._id,
      referee_id: referee._id,
      name: 'King Edward VII Stakes Demo',
      race_date: new Date(now - 10 * 60 * 1000),
      distance: 1200,
      max_participants: HORSES.length,
      location: 'Ascot Turf Course',
      prize_pool: PRIZE_POOL,
      prize_currency: PRIZE_CURRENCY,
      prize_distribution: PRIZE_DISTRIBUTION,
      registration_locked: false,
      registration_lock_at: new Date(now - 3 * 60 * 60 * 1000),
      status: 'scheduled'
    },
    { upsert: true, new: true, runValidators: true }
  );

  await HorseCheck.deleteMany({ race_id: race._id });
  await JockeyAssignment.deleteMany({ race_id: race._id });
  await Registration.deleteMany({ race_id: race._id });
  await RaceRun.deleteMany({ race_id: race._id });
  await RaceResult.deleteMany({ race_id: race._id });
  await RefereeReport.deleteMany({ race_id: race._id });
  await Violation.deleteMany({ race_id: race._id });

  const horses = [];

  for (let index = 0; index < HORSES.length; index += 1) {
    const data = HORSES[index];
    const horse = await Horse.findOneAndUpdate(
      { registration_number: data.number },
      {
        owner_id: owner._id,
        name: data.name,
        registration_number: data.number,
        breed: data.breed,
        gender: data.gender,
        color: data.color || COLORS[index % COLORS.length],
        weight: data.weight,
        health_status: 'fit',
        status: 'active'
      },
      { upsert: true, new: true, runValidators: true }
    );

    horses.push(horse);

    await Registration.findOneAndUpdate(
      { race_id: race._id, horse_id: horse._id },
      {
        tournament_id: tournament._id,
        race_id: race._id,
        horse_id: horse._id,
        owner_id: owner._id,
        status: 'approved',
        admin_note: 'Approved for 2D demo field.',
        approved_by: admin._id,
        approved_at: new Date(now - 2 * 60 * 60 * 1000)
      },
      { upsert: true, new: true, runValidators: true }
    );

    const assignment = await JockeyAssignment.findOneAndUpdate(
      { race_id: race._id, horse_id: horse._id },
      {
        race_id: race._id,
        horse_id: horse._id,
        owner_id: owner._id,
        jockey_id: jockeyProfiles[index]._id,
        assignment_type: 'primary',
        status: 'accepted',
        invitation_message: 'Confirmed ride for the Ascot demo card.',
        contract: {
          contract_number: 'ASCOT-DEMO-' + String(index + 1).padStart(2, '0'),
          title: data.name + ' riding agreement',
          file_url: 'https://res.cloudinary.com/demo/raw/upload/v1/contracts/ascot-demo-' + String(index + 1) + '.pdf',
          file_public_id: 'contracts/ascot-demo-' + String(index + 1),
          file_type: 'application/pdf',
          file_name: 'ascot-demo-' + String(index + 1) + '.pdf',
          signed_at: new Date(now - 100 * 60 * 1000),
          uploaded_at: new Date(now - 95 * 60 * 1000),
          confirmed_at: new Date(now - 90 * 60 * 1000)
        },
        responded_at: new Date(now - 90 * 60 * 1000)
      },
      { upsert: true, new: true, runValidators: true }
    );

    horse.assignment = assignment;
  }

  for (const item of PRIZE_DISTRIBUTION) {
    await Prize.findOneAndUpdate(
      { race_id: race._id, position: item.position },
      {
        tournament_id: tournament._id,
        race_id: race._id,
        prize_name: 'Ascot Demo ' + item.label,
        position: item.position,
        percent: item.percent,
        amount: Math.round(PRIZE_POOL * item.percent / 100),
        currency: PRIZE_CURRENCY,
        description: item.label + ' prize for the 2D demo race.'
      },
      { upsert: true, new: true, runValidators: true }
    );
  }

  console.log('2D referee-flow demo seed ready');
  console.log('Password:', PASSWORD);
  console.log('Admin:', admin.email);
  console.log('Owner:', ownerUser.email);
  console.log('Referee:', refereeUser.email);
  console.log('Spectator:', spectatorUser.email);
  console.log('Race:', race.name);
  console.log('Race status:', race.status);
  console.log('Participants:', horses.length);
  console.log('Tournament ID:', tournament._id.toString());
  console.log('Race ID:', race._id.toString());
  console.log('Jockeys:');
  JOCKEYS.slice(0, HORSES.length).forEach(function(jockey) {
    console.log('-', jockey.email);
  });
  console.log('Referee pre-check FE path:', '/referee/races/' + race._id.toString() + '/horse-inspection');
  console.log('Referee monitor FE path:', '/referee/races/' + race._id.toString() + '/monitor');
  console.log('Spectator FE path:', '/spectator/tournaments/' + tournament._id.toString() + '/races/' + race._id.toString());
}

seed()
  .catch(function(error) {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async function() {
    await mongoose.disconnect();
  });
