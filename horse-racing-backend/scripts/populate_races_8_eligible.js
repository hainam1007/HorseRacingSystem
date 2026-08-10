require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { connectDatabase } = require('../config/database');
const {
  User,
  Role,
  UserRole,
  Horse,
  Jockey,
  HorseOwner,
  Race,
  Registration,
  JockeyAssignment,
  HorseCheck
} = require('../models');

const PASSWORD = 'Password123';

async function createDynamicHorse(ownerId, nameIndex) {
  const name = `Stable Horse ${nameIndex}`;
  const breeds = ['Thoroughbred', 'Arabian', 'Quarter Horse', 'Appaloosa', 'Paint Horse'];
  const breed = breeds[nameIndex % breeds.length];
  const genders = ['male', 'female'];
  const gender = genders[nameIndex % genders.length];

  return Horse.create({
    owner_id: ownerId,
    name,
    breed,
    gender,
    date_of_birth: new Date('2021-04-10T00:00:00.000Z'),
    status: 'active'
  });
}

async function createDynamicJockey(roles, nameIndex) {
  const email = `jockey_dynamic_${nameIndex}@racing.test`;
  const fullName = `Jockey Runner ${nameIndex}`;
  const password = await bcrypt.hash(PASSWORD, 10);

  const user = await User.create({
    full_name: fullName,
    email,
    password,
    phone_number: `+84900000${String(100 + nameIndex)}`,
    avatar_url: 'https://i.pinimg.com/1200x/e2/9b/73/e29b73519a7852c8cb9c33565dc89ac7.jpg',
    status: 'active',
    email_verified: true,
    email_verified_at: new Date(),
    password_changed_at: new Date()
  });

  await UserRole.create({
    user_id: user._id,
    role_id: roles.jockey._id
  });

  return Jockey.create({
    user_id: user._id,
    height: 160 + (nameIndex % 10),
    weight: 50 + (nameIndex % 6),
    experience_years: 3 + (nameIndex % 5),
    license_number: `JCK-DYN-${String(100 + nameIndex)}`
  });
}

async function main() {
  await connectDatabase();

  const admin = await User.findOne({ email: 'admin@racing.test' });
  if (!admin) {
    throw new Error('Admin user not found. Please run seed:demo:reset first.');
  }

  // Load roles
  const dbRoles = await Role.find({});
  const roles = {};
  dbRoles.forEach(r => {
    roles[r.role_name] = r;
  });

  if (!roles.jockey) {
    throw new Error('Jockey role not found.');
  }

  // Find first owner to assign new horses
  const firstOwner = await HorseOwner.findOne({});
  if (!firstOwner) {
    throw new Error('No horse owner profile found to assign new horses.');
  }

  // Load active horses
  let horses = await Horse.find({ status: 'active' });
  console.log(`Initial active horses in DB: ${horses.length}`);

  // Load jockeys
  let jockeys = await Jockey.find({});
  console.log(`Initial jockeys in DB: ${jockeys.length}`);

  // Make sure we have at least 16 horses and 16 jockeys in the DB to have enough variation
  let dynamicIndex = 1;
  while (horses.length < 24) {
    const newHorse = await createDynamicHorse(firstOwner._id, dynamicIndex++);
    horses.push(newHorse);
  }
  console.log(`Total active horses after expansion: ${horses.length}`);

  dynamicIndex = 1;
  while (jockeys.length < 24) {
    const newJockey = await createDynamicJockey(roles, dynamicIndex++);
    jockeys.push(newJockey);
  }
  console.log(`Total jockeys after expansion: ${jockeys.length}`);

  const races = await Race.find({});
  console.log(`Found ${races.length} races to process.`);

  let totalRegistrationsCreated = 0;
  let totalJockeyAssignmentsCreated = 0;
  let totalHorseChecksCreated = 0;

  for (const race of races) {
    // 1. Force max_participants to 8
    if (race.max_participants !== 8) {
      race.max_participants = 8;
      await race.save();
    }

    // Get current registrations for this race
    const currentRegistrations = await Registration.find({ race_id: race._id });
    
    // Ensure existing registrations are approved
    for (const reg of currentRegistrations) {
      if (reg.status !== 'approved') {
        reg.status = 'approved';
        reg.approved_by = admin._id;
        reg.approved_at = new Date();
        await reg.save();
      }
    }

    const registeredHorseIds = new Set(currentRegistrations.map(r => r.horse_id.toString()));
    const approvedRegistrations = [...currentRegistrations];

    // 2. Add registrations up to 8
    let horseIndex = 0;
    while (approvedRegistrations.length < 8) {
      const candidateHorse = horses[horseIndex % horses.length];
      const horseIdStr = candidateHorse._id.toString();

      if (!registeredHorseIds.has(horseIdStr)) {
        const approvedAt = new Date();
        const raceDate = race.race_date ? new Date(race.race_date) : approvedAt;
        const registeredAt = new Date(raceDate.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days before

        const newReg = await Registration.create({
          tournament_id: race.tournament_id,
          race_id: race._id,
          horse_id: candidateHorse._id,
          owner_id: candidateHorse.owner_id,
          status: 'approved',
          note: 'Added to complete 8 participants.',
          admin_note: 'Automatically approved for full field.',
          registered_at: registeredAt,
          approved_by: admin._id,
          approved_at: approvedAt
        });

        approvedRegistrations.push(newReg);
        registeredHorseIds.add(horseIdStr);
        totalRegistrationsCreated++;
      }
      horseIndex++;
    }

    // 3. For each of the 8 registrations, check/create accepted JockeyAssignment and passed HorseCheck
    // We want unique jockeys for each horse in the same race
    const jockeysInRace = new Set();
    const currentAssignments = await JockeyAssignment.find({ race_id: race._id });
    
    // Track jockeys that are already accepted for this race
    currentAssignments.forEach(a => {
      if (a.status === 'accepted') {
        jockeysInRace.add(a.jockey_id.toString());
      }
    });

    let jockeyIndex = 0;
    for (const reg of approvedRegistrations) {
      const horseIdStr = reg.horse_id.toString();
      
      // Find or create jockey assignment
      let assignment = currentAssignments.find(a => a.horse_id.toString() === horseIdStr);
      
      if (!assignment || assignment.status !== 'accepted') {
        // Find a jockey not yet participating in this race
        let selectedJockey = null;
        for (let attempts = 0; attempts < jockeys.length; attempts++) {
          const candidateJockey = jockeys[(jockeyIndex + attempts) % jockeys.length];
          const jockeyIdStr = candidateJockey._id.toString();
          
          if (!jockeysInRace.has(jockeyIdStr)) {
            selectedJockey = candidateJockey;
            jockeyIndex = (jockeyIndex + attempts + 1) % jockeys.length;
            break;
          }
        }

        if (!selectedJockey) {
          // If no jockey left in pool, just assign the first one (fallback, shouldn't happen with 24 jockeys)
          selectedJockey = jockeys[0];
        }

        const jockeyIdStr = selectedJockey._id.toString();
        jockeysInRace.add(jockeyIdStr);

        if (assignment) {
          assignment.jockey_id = selectedJockey._id;
          assignment.status = 'accepted';
          if (!assignment.owner_id) {
            assignment.owner_id = reg.owner_id;
          }
          await assignment.save();
        } else {
          assignment = await JockeyAssignment.create({
            race_id: race._id,
            horse_id: reg.horse_id,
            owner_id: reg.owner_id,
            jockey_id: selectedJockey._id,
            status: 'accepted',
            invited_at: new Date(),
            accepted_at: new Date()
          });
        }
        totalJockeyAssignmentsCreated++;
      } else {
        jockeysInRace.add(assignment.jockey_id.toString());
      }

      // Find or create passed HorseCheck for pre_race
      let preCheck = await HorseCheck.findOne({
        race_id: race._id,
        horse_id: reg.horse_id,
        phase: 'pre_race'
      });

      if (!preCheck) {
        preCheck = await HorseCheck.create({
          race_id: race._id,
          horse_id: reg.horse_id,
          referee_id: race.referee_id || admin._id, // fallback to admin if no referee assigned
          phase: 'pre_race',
          status: 'passed',
          is_eligible: true,
          checked_at: new Date(),
          notes: 'Automatically checked and passed.'
        });
        totalHorseChecksCreated++;
      } else if (preCheck.status !== 'passed' || preCheck.is_eligible !== true) {
        preCheck.status = 'passed';
        preCheck.is_eligible = true;
        await preCheck.save();
      }

      // If race is completed/finished, also ensure passed HorseCheck for post_race
      if (['completed', 'finished'].includes((race.status || '').toLowerCase())) {
        let postCheck = await HorseCheck.findOne({
          race_id: race._id,
          horse_id: reg.horse_id,
          phase: 'post_race'
        });

        if (!postCheck) {
          await HorseCheck.create({
            race_id: race._id,
            horse_id: reg.horse_id,
            referee_id: race.referee_id || admin._id,
            phase: 'post_race',
            status: 'passed',
            is_eligible: true,
            checked_at: new Date(),
            notes: 'Automatically checked post-race.'
          });
          totalHorseChecksCreated++;
        } else if (postCheck.status !== 'passed' || postCheck.is_eligible !== true) {
          postCheck.status = 'passed';
          postCheck.is_eligible = true;
          await postCheck.save();
        }
      }
    }

    console.log(`Processed Race: "${race.name}" -> Now has 8 eligible participants.`);
  }

  console.log(`\nMigration completed successfully!`);
  console.log(`- New Registrations Created: ${totalRegistrationsCreated}`);
  console.log(`- New Accepted Jockey Assignments: ${totalJockeyAssignmentsCreated}`);
  console.log(`- New Passed Horse Checks: ${totalHorseChecksCreated}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
