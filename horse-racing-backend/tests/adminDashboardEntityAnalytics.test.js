const assert = require('node:assert/strict');
const test = require('node:test');
const { getSequelize } = require('../config/sequelize');
const adminDashboardService = require('../services/adminDashboardService');

test('horse owner analytics SQL includes horse count, details, and race history payloads', async () => {
  const sequelize = getSequelize();
  const originalQuery = sequelize.query;
  const capture = [];

  sequelize.query = async (sql) => {
    capture.push(String(sql));

    if (String(sql).includes('FROM horse_owners')) {
      return [[{
        id: 'owner-1',
        name: 'Owner A',
        races: 1,
        wins: 1,
        value: '150000',
        horse_count: 2,
        horse_names: JSON.stringify(['Red Lightning', 'Black Jet']),
        horse_details: [{ id: 'horse-1', name: 'Red Lightning' }],
        race_details: [{ id: 'race-1', horse_name: 'Red Lightning', race_name: 'Test race', position: 2, participants: 8 }]
      }]];
    }

    if (String(sql).includes('FROM jockeys')) return [[]];
    if (String(sql).includes('FROM race_referees')) return [[]];
    if (String(sql).includes('FROM horses')) return [[]];
    if (String(sql).includes('FROM users u JOIN bets')) return [[]];

    return [[]];
  };

  try {
    await adminDashboardService.getEntityAnalytics('2026-08-01', '2026-08-31');
    const ownerSql = capture.find((sql) => sql.includes('FROM horse_owners'));

    assert.ok(ownerSql, 'owner analytics SQL should be issued');
    assert.match(ownerSql, /horse_count/i);
    assert.match(ownerSql, /horse_names/i);
    assert.match(ownerSql, /horse_details/i);
    assert.match(ownerSql, /race_details/i);
  } finally {
    sequelize.query = originalQuery;
  }
});
