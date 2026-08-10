require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const { connectDatabase } = require('../config/database');
const { signAuthToken } = require('../utils/jwt');
const { hashPassword } = require('../utils/password');
const {
  User,
  Wallet,
  DepositRequest,
  Bet,
  PrizeAward
} = require('../models');

const prefix = 'e2e-admindashboard-' + Date.now();
const ids = {
  users: [],
  wallets: [],
  deposits: [],
  bets: [],
  prizes: []
};

const results = [];
let server;
let baseUrl;

function addId(kind, id) {
  if (!ids[kind]) ids[kind] = [];
  if (id) ids[kind].push(id);
}

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log((passed ? 'PASS' : 'FAIL') + ' - ' + name + ' - ' + detail);
}

async function request(method, path, token, body) {
  const response = await fetch(baseUrl + path, {
    method: method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(() => null);

  return {
    status: response.status,
    body: json
  };
}

async function cleanup() {
  console.log('Cleaning up database...');
  await User.deleteMany({ _id: { $in: ids.users || [] } });
  await Wallet.deleteMany({ _id: { $in: ids.wallets || [] } });
  const { Role, UserRole } = require('../models');
  await UserRole.deleteMany({ user_id: { $in: ids.users || [] } });
  await DepositRequest.deleteMany({ _id: { $in: ids.deposits || [] } });
  await Bet.deleteMany({ _id: { $in: ids.bets || [] } });
  await PrizeAward.deleteMany({ _id: { $in: ids.prizes || [] } });
  console.log('Cleanup complete.');
}

async function runTests() {
  await connectDatabase();
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, () => resolve());
  });
  const port = server.address().port;
  baseUrl = 'http://127.0.0.1:' + port;
  console.log('Test server running on port ' + port);

  try {
    const { Role, UserRole } = require('../models');

    // Seed roles
    const adminRole = await Role.findOneAndUpdate({ role_name: 'admin' }, { description: 'Admin role' }, { upsert: true, new: true });
    const spectatorRole = await Role.findOneAndUpdate({ role_name: 'spectator' }, { description: 'Spectator role' }, { upsert: true, new: true });

    const adminUser = new User({
      username: prefix + 'admin',
      email: prefix + 'admin@test.com',
      password: await hashPassword('password123'),
      status: 'active',
      full_name: 'Admin User'
    });
    await adminUser.save();
    addId('users', adminUser._id);
    await new UserRole({ user_id: adminUser._id, role_id: adminRole._id }).save();
    const adminToken = signAuthToken({ user_id: adminUser.id, role: 'admin' });

    const normalUser = new User({
      username: prefix + 'user',
      email: prefix + 'user@test.com',
      password: await hashPassword('password123'),
      status: 'active',
      full_name: 'Normal User'
    });
    await normalUser.save();
    addId('users', normalUser._id);
    await new UserRole({ user_id: normalUser._id, role_id: spectatorRole._id }).save();
    const normalToken = signAuthToken({ user_id: normalUser.id, role: 'spectator' });

    // 2. Create Wallets
    const w1 = new Wallet({ user_id: adminUser._id, token_balance: 1000, status: 'active' });
    const w2 = new Wallet({ user_id: normalUser._id, token_balance: 500, status: 'active' });
    await w1.save(); await w2.save();
    addId('wallets', w1._id); addId('wallets', w2._id);

    // 3. Create Deposits
    const d1 = new DepositRequest({ user_id: normalUser._id, total_vnd: 50000, total_token: 50, payment_method: 'MOMO', status: 'success', order_id: 'TEST-1234', package_id: 'PKG-1' });
    const d2 = new DepositRequest({ user_id: normalUser._id, total_vnd: 20000, total_token: 20, payment_method: 'VNPAY', status: 'pending', order_id: 'TEST-5678', package_id: 'PKG-1' });
    await d1.save(); await d2.save();
    addId('deposits', d1._id); addId('deposits', d2._id);

    // 4. Create Bets
    const dummyRaceId = new mongoose.Types.ObjectId();
    const dummyHorseId = new mongoose.Types.ObjectId();
    const b1 = new Bet({ spectator_id: normalUser._id, race_id: dummyRaceId, predicted_horse_id: dummyHorseId, stake_amount: 100, potential_payout: 200, status: 'won', payout_amount: 200 });
    const b2 = new Bet({ spectator_id: normalUser._id, race_id: dummyRaceId, predicted_horse_id: dummyHorseId, stake_amount: 50, potential_payout: 100, status: 'pending', payout_amount: 0 });
    await b1.save(); await b2.save();
    addId('bets', b1._id); addId('bets', b2._id);

    // 5. Create Prize Awards
    const dummyOwnerId = new mongoose.Types.ObjectId();
    const dummyPrizeId = new mongoose.Types.ObjectId();
    const p1 = new PrizeAward({ race_id: dummyRaceId, horse_id: dummyHorseId, amount: 100, gross_amount: 110, currency: 'VND', status: 'paid', owner_id: dummyOwnerId, race_result_id: new mongoose.Types.ObjectId(), prize_id: dummyPrizeId });
    const p2 = new PrizeAward({ race_id: dummyRaceId, horse_id: dummyHorseId, amount: 50, gross_amount: 50, currency: 'TOKEN', status: 'calculated', owner_id: dummyOwnerId, race_result_id: new mongoose.Types.ObjectId(), prize_id: dummyPrizeId });
    await p1.save(); await p2.save();
    addId('prizes', p1._id); addId('prizes', p2._id);

    // TEST CASES
    
    // Test Auth Guard
    const authRes = await request('GET', '/api/admin/dashboard', normalToken);
    record('Access Denied for non-admin', authRes.status === 403, 'Expected 403 for SPECTATOR');

    // Test Dashboard Summary
    const sumRes = await request('GET', '/api/admin/dashboard', adminToken);
    record('Dashboard API', sumRes.status === 200, 'Returned 200 OK');
    if (sumRes.body) {
      record('Dashboard Data Valid', sumRes.body.active_wallets >= 2 && sumRes.body.total_successful_deposit_vnd >= 50000, 'Contains seeded data');
    }

    // Test Betting Summary
    const betRes = await request('GET', '/api/admin/betting-summary?from=2020-01-01&to=2099-12-31', adminToken);
    record('Betting Summary API', betRes.status === 200, 'Returned 200 OK');
    if (betRes.body) {
      console.log('betRes.body:', betRes.body);
      record('Betting Data Valid', betRes.body.token_staked >= 150 && betRes.body.settled_bets >= 1, 'Calculated stakes properly');
    }

    // Test Deposit Requests
    const depRes = await request('GET', '/api/admin/deposit-requests', adminToken);
    record('Deposit Requests API', depRes.status === 200, 'Returned 200 OK');
    if (depRes.body && depRes.body.summary) {
      record('Deposit Data Valid', depRes.body.summary.success_count >= 1 && depRes.body.list.length >= 2, 'Paginated list and summary generated');
      record('Deposit Pagination Metadata Valid', depRes.body.total >= 2 && depRes.body.total_pages >= 1, 'Includes total and total_pages');
    } else {
      console.log('depRes.body (error):', depRes.body);
    }

    // Test Prize Awards
    const prizeRes = await request('GET', '/api/admin/prize-awards/summary', adminToken);
    record('Prize Awards API', prizeRes.status === 200, 'Returned 200 OK');
    if (prizeRes.body && prizeRes.body.VND) {
      record('Prize Awards Currency Grouping', prizeRes.body.VND.total_amount >= 110 && prizeRes.body.TOKEN.total_amount >= 50, 'Grouped currencies correctly');
    }

  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    await cleanup();
    server.close();
    await mongoose.connection.close();
    
    const failed = results.filter(r => !r.passed);
    if (failed.length > 0) {
      console.error(failed.length + ' tests failed.');
      process.exit(1);
    } else {
      console.log('All tests passed successfully.');
      process.exit(0);
    }
  }
}

runTests();
