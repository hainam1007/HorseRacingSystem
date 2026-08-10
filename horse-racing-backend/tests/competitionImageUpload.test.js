const assert = require('node:assert/strict');
const test = require('node:test');

const tournamentService = require('../services/tournamentService');
const raceService = require('../services/raceService');
const tournamentRepository = require('../repositories/tournamentRepository');
const roundRepository = require('../repositories/roundRepository');
const raceRepository = require('../repositories/raceRepository');
const cloudinaryService = require('../services/cloudinaryService');

const IMAGE_DATA = 'data:image/png;base64,aGVsbG8=';
const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const ROUND_ID = '507f1f77bcf86cd799439012';

test('competition services upload image files and persist the Cloudinary result', async (t) => {
  const originals = {
    uploadAsset: cloudinaryService.uploadAsset,
    createTournament: tournamentRepository.create,
    findTournament: tournamentRepository.findById,
    findRound: roundRepository.findById,
    createRace: raceRepository.create
  };

  t.after(() => {
    cloudinaryService.uploadAsset = originals.uploadAsset;
    tournamentRepository.create = originals.createTournament;
    tournamentRepository.findById = originals.findTournament;
    roundRepository.findById = originals.findRound;
    raceRepository.create = originals.createRace;
  });

  cloudinaryService.uploadAsset = async (source, options) => ({
    secure_url: `https://res.cloudinary.com/demo/${options.folder}/image.png`,
    public_id: `${options.folder}/image`,
    source
  });
  tournamentRepository.create = async (payload) => payload;
  tournamentRepository.findById = async (id) => (id === TOURNAMENT_ID ? { _id: id } : null);
  roundRepository.findById = async (id) => (id === ROUND_ID ? { _id: id } : null);
  raceRepository.create = async (payload) => payload;

  const tournamentResult = await tournamentService.createTournament('admin-id', {
    name: 'Uploaded tournament',
    image_file_data: IMAGE_DATA
  });
  const raceResult = await raceService.createRace({
    tournament_id: TOURNAMENT_ID,
    round_id: ROUND_ID,
    name: 'Uploaded race',
    image_file_data: IMAGE_DATA
  });

  assert.equal(tournamentResult.tournament.image_url, 'https://res.cloudinary.com/demo/horse-racing/tournaments/image.png');
  assert.equal(tournamentResult.tournament.image_public_id, 'horse-racing/tournaments/image');
  assert.equal(tournamentResult.tournament.image_file_data, undefined);
  assert.equal(raceResult.race.image_url, 'https://res.cloudinary.com/demo/horse-racing/races/image.png');
  assert.equal(raceResult.race.image_public_id, 'horse-racing/races/image');
  assert.equal(raceResult.race.image_file_data, undefined);
});
