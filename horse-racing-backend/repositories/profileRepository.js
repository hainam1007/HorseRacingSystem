const { HorseOwner, Jockey, RaceReferee } = require('../models');
const { ROLE_NAMES } = require('../constants/roles');

function buildHorseOwnerProfile(userId, profileData) {
  return {
    user_id: userId,
    stable_name: profileData.stable_name,
    address: profileData.address,
    license_number: profileData.license_number,
    status: profileData.status || 'active'
  };
}

function buildJockeyProfile(userId, profileData) {
  return {
    user_id: userId,
    height: profileData.height,
    weight_kg: profileData.weight_kg === undefined ? profileData.weight : profileData.weight_kg,
    experience_years: profileData.experience_years || 0,
    license_number: profileData.license_number,
    total_races: profileData.total_races || 0,
    total_wins: profileData.total_wins || 0,
    status: profileData.status || 'active'
  };
}

function buildRaceRefereeProfile(userId, profileData) {
  return {
    user_id: userId,
    license_number: profileData.license_number,
    experience_years: profileData.experience_years || 0,
    status: profileData.status || 'active'
  };
}

async function createProfiles(userId, roleNames, profiles) {
  const createdProfiles = {};
  const profileData = profiles || {};

  if (roleNames.includes(ROLE_NAMES.HORSE_OWNER)) {
    createdProfiles.horse_owner = await HorseOwner.create(
      buildHorseOwnerProfile(userId, profileData.horse_owner || {})
    );
  }

  if (roleNames.includes(ROLE_NAMES.JOCKEY)) {
    createdProfiles.jockey = await Jockey.create(
      buildJockeyProfile(userId, profileData.jockey || {})
    );
  }

  if (roleNames.includes(ROLE_NAMES.RACE_REFEREE)) {
    createdProfiles.race_referee = await RaceReferee.create(
      buildRaceRefereeProfile(userId, profileData.race_referee || {})
    );
  }

  return createdProfiles;
}

async function findHorseOwnerByUserId(userId) {
  return HorseOwner.findOne({ user_id: userId });
}

async function findJockeyByUserId(userId) {
  return Jockey.findOne({ user_id: userId });
}

async function findRaceRefereeByUserId(userId) {
  return RaceReferee.findOne({ user_id: userId });
}

async function findRaceRefereeById(id) {
  return RaceReferee.findById(id);
}

async function updateJockeyByUserId(userId, updateData) {
  return Jockey.findOneAndUpdate(
    { user_id: userId },
    updateData,
    {
      returnDocument: 'after',
      runValidators: true
    }
  );
}

async function getProfilesByUserId(userId) {
  const [horseOwner, jockey, raceReferee] = await Promise.all([
    HorseOwner.findOne({ user_id: userId }).lean(),
    Jockey.findOne({ user_id: userId }).lean(),
    RaceReferee.findOne({ user_id: userId }).lean()
  ]);

  const profiles = {};

  if (horseOwner) {
    profiles.horse_owner = horseOwner;
  }

  if (jockey) {
    profiles.jockey = jockey;
  }

  if (raceReferee) {
    profiles.race_referee = raceReferee;
  }

  return profiles;
}

module.exports = {
  createProfiles,
  findHorseOwnerByUserId,
  findJockeyByUserId,
  findRaceRefereeById,
  findRaceRefereeByUserId,
  updateJockeyByUserId,
  getProfilesByUserId
};
