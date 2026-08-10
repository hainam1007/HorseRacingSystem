const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const mongoose = require('mongoose');

const probabilityEngineService = require('../services/probabilityEngineService');
const probabilityFeatureBuilderService = require('../services/probabilityFeatureBuilderService');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('race odds routes and model are wired into the backend', () => {
  const routeSource = readProjectFile('routes/races.js');
  const modelIndexSource = readProjectFile('models/index.js');
  const apiDocsSource = readProjectFile('docs/API.md');

  assert.match(routeSource, /raceOddsController/);
  assert.match(routeSource, /\/:id\/odds/);
  assert.match(routeSource, /\/:id\/odds\/generate/);
  assert.match(routeSource, /router\.patch\('\/:id\/odds'/);
  assert.match(modelIndexSource, /RaceOddsMarket/);
  assert.match(apiDocsSource, /Race Odds APIs/);
});

test('historical feature builder ignores future race results', () => {
  const horseId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const jockeyId = new mongoose.Types.ObjectId();
  const futureRace = {
    race_date: new Date('2026-08-01T00:00:00.000Z'),
    distance: 1200,
    location: 'ST',
    going: 'Good'
  };
  const pastResults = [
    {
      horse_id: { _id: horseId, owner_id: ownerId },
      jockey_id: { _id: jockeyId },
      race_id: {
        race_date: new Date('2026-05-01T00:00:00.000Z'),
        distance: 1200,
        location: 'ST',
        going: 'Good'
      },
      final_position: 1
    },
    {
      horse_id: { _id: horseId, owner_id: ownerId },
      jockey_id: { _id: jockeyId },
      race_id: {
        race_date: new Date('2026-06-15T00:00:00.000Z'),
        distance: 1400,
        location: 'ST',
        going: 'Good'
      },
      final_position: 3
    },
    {
      horse_id: { _id: horseId, owner_id: ownerId },
      jockey_id: { _id: jockeyId },
      race_id: futureRace,
      final_position: 1
    }
  ];

  const features = probabilityFeatureBuilderService._private.computeHistoricalFeatures({
    currentRaceDate: new Date('2026-07-01T00:00:00.000Z'),
    currentDistance: 1200,
    currentVenue: 'ST',
    currentGoing: 'Good',
    horseId,
    jockeyId,
    ownerId,
    pastResults,
    fallbacks: []
  });

  assert.equal(features.hist_horse_prior_starts, 2);
  assert.equal(features.hist_horse_prior_wins, 1);
  assert.equal(features.hist_horse_prior_places, 2);
  assert.equal(features.hist_horse_same_distance_starts, 1);
  assert.equal(features.hist_trainer_prior_starts, 2);
  assert.equal(features.hist_jockey_trainer_prior_starts, 2);
});

test('probability engine wrapper returns race probabilities that sum to one', async () => {
  const samplePayload = {
    race_id: 'race-1',
    horses: [
      { horse_no: 1, horse_name: 'Demo Runner' },
      { horse_no: 2, horse_name: 'Second Wind' }
    ]
  };
  const enginePrediction = {
    race_id: samplePayload.race_id,
    horses: [
      {
        horse_no: 1,
        horse_name: 'Demo Runner',
        win_probability: 0.6,
        fair_odds: 1.666667,
        game_odds: 1.96,
        probability_rank: 1
      },
      {
        horse_no: 2,
        horse_name: 'Second Wind',
        win_probability: 0.4,
        fair_odds: 2.5,
        game_odds: 2.94,
        probability_rank: 2
      }
    ]
  };
  const server = http.createServer((req, res) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), samplePayload);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: enginePrediction }));
    });
  });
  const previousMode = process.env.PROBABILITY_ENGINE_MODE;
  const previousUrl = process.env.PROBABILITY_ENGINE_URL;

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.PROBABILITY_ENGINE_MODE = 'http';
  process.env.PROBABILITY_ENGINE_URL = `http://127.0.0.1:${server.address().port}/predict`;

  let prediction;

  try {
    prediction = await probabilityEngineService.predictRace(samplePayload);
  } finally {
    if (previousMode === undefined) {
      delete process.env.PROBABILITY_ENGINE_MODE;
    } else {
      process.env.PROBABILITY_ENGINE_MODE = previousMode;
    }

    if (previousUrl === undefined) {
      delete process.env.PROBABILITY_ENGINE_URL;
    } else {
      process.env.PROBABILITY_ENGINE_URL = previousUrl;
    }

    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  const total = prediction.horses.reduce((sum, horse) => sum + horse.win_probability, 0);

  assert.equal(prediction.horses.length, samplePayload.horses.length);
  assert.ok(Math.abs(total - 1) < 0.00001);
  assert.ok(prediction.horses.every((horse) => horse.fair_odds >= 1));
  assert.ok(prediction.horses.every((horse) => horse.game_odds >= 1.01));
});

test('probability engine http wrapper unwraps deployed API response shape', () => {
  const prediction = {
    race_id: 'race-1',
    horses: [
      {
        horse_no: 1,
        horse_name: 'Demo Runner',
        win_probability: 1,
        fair_odds: 1,
        game_odds: 1.01,
        probability_rank: 1
      }
    ]
  };

  assert.deepEqual(
    probabilityEngineService._private.unwrapPredictionResponse({
      success: true,
      data: prediction
    }),
    prediction
  );
});
