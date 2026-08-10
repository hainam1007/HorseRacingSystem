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
  TransactionHistory,
  RewardItem,
  RedemptionHistory
} = require('../models');

const prefix = 'e2e-wallet-reward-' + Date.now();
const ids = {
  users: [],
  wallets: [],
  transactions: [],
  rewards: [],
  redemptions: []
};

const results = [];
let server;
let baseUrl;

function addId(kind, id) {
  if (!ids[kind]) {
    ids[kind] = [];
  }
  if (id) {
    ids[kind].push(id);
  }
}

function record(name, passed, detail) {
  results.push({ name: name, passed: passed, detail: detail });
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
  const json = await response.json().catch(function() {
    return null;
  });

  return {
    status: response.status,
    body: json
  };
}

async function cleanup() {
  console.log('Cleaning up database...');
  await User.deleteMany({ _id: { $in: ids.users || [] } });
  await Wallet.deleteMany({ _id: { $in: ids.wallets || [] } });
  await TransactionHistory.deleteMany({ _id: { $in: ids.transactions || [] } });
  await RewardItem.deleteMany({ _id: { $in: ids.rewards || [] } });
  await RedemptionHistory.deleteMany({ _id: { $in: ids.redemptions || [] } });
}

async function run() {
  try {
    await connectDatabase();
    
    // Create E2E server
    server = http.createServer(app);
    await new Promise(function(resolve) {
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = 'http://127.0.0.1:' + server.address().port;
    console.log(`E2E Server listening on ${baseUrl}`);

    // Create E2E Test User
    const testUser = await User.create({
      full_name: prefix + ' Tester',
      email: prefix + '-tester@example.com',
      password: await hashPassword('Password123'),
      status: 'active',
      email_verified: true,
      email_verified_at: new Date()
    });
    addId('users', testUser._id);

    const token = signAuthToken({
      user_id: testUser._id.toString(),
      email: testUser.email,
      roles: ['spectator']
    });

    // Create E2E Test Reward Item
    const testReward = await RewardItem.create({
      name: prefix + ' Ticket',
      description: 'E2E test ticket',
      token_price: 20,
      stock: 2,
      is_active: true
    });
    addId('rewards', testReward._id);

    const testExpensiveReward = await RewardItem.create({
      name: prefix + ' Golden Trophy',
      description: 'E2E expensive reward item',
      token_price: 500,
      stock: 5,
      is_active: true
    });
    addId('rewards', testExpensiveReward._id);

    const testOutOfStockReward = await RewardItem.create({
      name: prefix + ' Empty Box',
      description: 'Out of stock item',
      token_price: 10,
      stock: 0,
      is_active: true
    });
    addId('rewards', testOutOfStockReward._id);

    console.log('Seeded E2E components successfully. Starting tests...');

    // 1. GET /api/wallet/me (Should auto-create wallet and return balance: 0)
    let res = await request('GET', '/api/wallet/me', token);
    record(
      'GET /api/wallet/me auto-creates and returns wallet',
      res.status === 200 && res.body.success && res.body.data.wallet.token_balance === 0,
      `status=${res.status}, balance=${res.body?.data?.wallet?.token_balance}`
    );
    if (res.body?.data?.wallet?._id) {
      addId('wallets', res.body.data.wallet._id);
    }

    // 2. POST /api/wallet/deposit (Deposit VND 50,000 -> 50 tokens)
    const referenceId = prefix + '-dep-1';
    res = await request('POST', '/api/wallet/deposit', token, {
      vnd_amount: 50000,
      reference_id: referenceId
    });
    record(
      'POST /api/wallet/deposit successfully adds tokens',
      res.status === 200 && res.body.success && res.body.data.wallet.token_balance === 50,
      `status=${res.status}, balance=${res.body?.data?.wallet?.token_balance}`
    );

    // Track transaction id if present in logs
    const trans = await TransactionHistory.findOne({ reference_id: referenceId });
    if (trans) {
      addId('transactions', trans._id);
    }

    // 3. Test Idempotency: POST same deposit with same reference_id
    res = await request('POST', '/api/wallet/deposit', token, {
      vnd_amount: 50000,
      reference_id: referenceId
    });
    record(
      'POST /api/wallet/deposit idempotency guards against duplicates',
      res.status === 409,
      `status=${res.status}, message=${res.body?.message}`
    );

    // 4. Test deposit validation (invalid vnd_amount)
    res = await request('POST', '/api/wallet/deposit', token, {
      vnd_amount: 500, // less than 1000
      reference_id: prefix + '-dep-invalid'
    });
    record(
      'POST /api/wallet/deposit rejects invalid amounts',
      res.status === 400,
      `status=${res.status}, message=${res.body?.message}`
    );

    // 5. GET /api/wallet/transactions (Should return 1 item)
    res = await request('GET', '/api/wallet/transactions', token);
    record(
      'GET /api/wallet/transactions lists audit logs',
      res.status === 200 && res.body.success && res.body.data.transactions.length === 1,
      `status=${res.status}, count=${res.body?.data?.transactions?.length}`
    );

    // 6. GET /api/rewards (Should list reward items including the seeded ones)
    res = await request('GET', '/api/rewards', token);
    const rewardItems = res.body?.data?.items || [];
    const hasSeededReward = rewardItems.some(item => item.name === testReward.name);
    record(
      'GET /api/rewards returns active rewards',
      res.status === 200 && res.body.success && hasSeededReward,
      `status=${res.status}, containsSeed=${hasSeededReward}`
    );

    // 7. POST /api/rewards/:itemId/redeem (Standard pass: 20 tokens, user has 50)
    res = await request('POST', `/api/rewards/${testReward._id}/redeem`, token);
    record(
      'POST /api/rewards/:itemId/redeem succeeds with sufficient balance',
      res.status === 200 && res.body.success && res.body.data.wallet.token_balance === 30,
      `status=${res.status}, balance=${res.body?.data?.wallet?.token_balance}`
    );

    // Save transaction and redemption generated
    if (res.body?.data?.redemption?._id) {
      addId('redemptions', res.body.data.redemption._id);
    }
    const redeemTrans = await TransactionHistory.findOne({ user_id: testUser._id, transaction_type: 'redeem' });
    if (redeemTrans) {
      addId('transactions', redeemTrans._id);
    }

    // Check database stock deduction
    const updatedTestReward = await RewardItem.findById(testReward._id);
    record(
      'Redemption atomically decrements item stock',
      updatedTestReward && updatedTestReward.stock === 1,
      `stock=${updatedTestReward?.stock}`
    );

    // 8. Test Insufficient Balance: POST redeem Golden Trophy (500 tokens, user has 30)
    res = await request('POST', `/api/rewards/${testExpensiveReward._id}/redeem`, token);
    record(
      'POST /api/rewards/:itemId/redeem rejects insufficient wallet funds',
      res.status === 402 && res.body.success === false,
      `status=${res.status}, message=${res.body?.message}`
    );

    // 9. Test Out of Stock: POST redeem Empty Box (stock is 0)
    res = await request('POST', `/api/rewards/${testOutOfStockReward._id}/redeem`, token);
    record(
      'POST /api/rewards/:itemId/redeem rejects out-of-stock items',
      res.status === 400 && res.body.success === false,
      `status=${res.status}, message=${res.body?.message}`
    );

    // 10. GET /api/rewards/redemptions (Should return 1 record)
    res = await request('GET', '/api/rewards/redemptions', token);
    record(
      'GET /api/rewards/redemptions returns redemption history',
      res.status === 200 && res.body.success && res.body.data.redemptions.length === 1,
      `status=${res.status}, count=${res.body?.data?.redemptions?.length}`
    );

    // Final summary
    const failures = results.filter(r => !r.passed);
    console.log(`\n========================================`);
    console.log(`E2E TEST SUMMARY: ${results.length - failures.length}/${results.length} tests passed.`);
    console.log(`========================================`);

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Unhandled error during E2E wallet/reward test:', err);
    process.exitCode = 1;
  } finally {
    await cleanup();
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.disconnect();
    console.log('MongoDB disconnected. E2E test finished.');
  }
}

run();
