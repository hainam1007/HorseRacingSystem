require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { Race, Registration, JockeyAssignment, HorseCheck } = require('../models');

async function main() {
  await connectDatabase();
  const races = await Race.find({}).lean();
  console.log(`Found ${races.length} races.`);

  for (const race of races) {
    const registrations = await Registration.find({ race_id: race._id }).lean();
    const approved = registrations.filter(r => r.status === 'approved');
    
    const horseIds = approved.map(r => r.horse_id);
    const assignments = await JockeyAssignment.find({ race_id: race._id, horse_id: { $in: horseIds } }).lean();
    const acceptedAssignments = assignments.filter(a => a.status === 'accepted');

    const checks = await HorseCheck.find({ race_id: race._id, phase: 'pre_race', horse_id: { $in: horseIds } }).lean();
    const passedChecks = checks.filter(c => c.status === 'passed' && c.is_eligible === true);

    console.log(`Race: "${race.name}" (${race.status})`);
    console.log(`  - Total Registrations: ${registrations.length}`);
    console.log(`  - Approved Registrations: ${approved.length}`);
    console.log(`  - Accepted Jockey Assignments: ${acceptedAssignments.length}`);
    console.log(`  - Passed Pre-Race Checks: ${passedChecks.length}`);
  }
  
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
