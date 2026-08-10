require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const { RewardItem, RedemptionHistory, Wallet, TransactionHistory, User, Role, UserRole } = require('../models');
const { signAuthToken } = require('../utils/jwt');
const { ROLE_NAMES } = require('../constants/roles');
const rewardService = require('../services/rewardService');
const cloudinaryService = require('../services/cloudinaryService');
let adminToken;
let userToken;
let adminId;
let userId;
let server;
let baseUrl;

async function clearCollections() {
  await RewardItem.deleteMany({});
  await RedemptionHistory.deleteMany({});
  await Wallet.deleteMany({});
  await TransactionHistory.deleteMany({});
  await User.deleteMany({});
  await UserRole.deleteMany({});
}

async function request(method, path, token, body) {
  let headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let requestBody = body;

  if (body) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(baseUrl + path, {
    method,
    headers,
    body: requestBody
  });

  const json = await response.json().catch(() => null);
  return { status: response.status, body: json };
}

test('Admin Reward Management E2E', async (t) => {
  let mongoServer;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await connectDatabase();
    await clearCollections();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Mock Cloudinary
    cloudinaryService.uploadOptionalSource = async (fileData, fileUrl, options) => {
      if (fileData && fileData.startsWith('data:image/')) {
        return { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/mock.png', skipped: false };
      }
      return { skipped: true, secure_url: fileUrl || null };
    };

    // Create Admin User
    const adminRole = await Role.findOneAndUpdate({ role_name: ROLE_NAMES.ADMIN }, { role_name: ROLE_NAMES.ADMIN }, { upsert: true, new: true });
    const admin = await User.create({
      full_name: 'Admin',
      email: 'admin_reward@test.com',
      password: 'hashed_password',
      phone_number: '1234567890',
      status: 'active'
    });
    adminId = admin._id;
    await UserRole.create({ user_id: adminId, role_id: adminRole._id });
    adminToken = signAuthToken({ user_id: adminId.toString(), roles: [ROLE_NAMES.ADMIN] });

    // Create Normal User
    const userRole = await Role.findOneAndUpdate({ role_name: ROLE_NAMES.SPECTATOR }, { role_name: ROLE_NAMES.SPECTATOR }, { upsert: true, new: true });
    const user = await User.create({
      full_name: 'Test User',
      email: 'user_reward@test.com',
      password: 'hashed_password',
      phone_number: '0987654321',
      status: 'active'
    });
    userId = user._id;
    await UserRole.create({ user_id: userId, role_id: userRole._id });
    userToken = signAuthToken({ user_id: userId.toString(), roles: [ROLE_NAMES.SPECTATOR] });

    await Wallet.create({ user_id: userId, token_balance: 1000 });

  });

  t.after(async () => {
    server.close();
    await clearCollections();
    await mongoose.connection.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  let rewardId1, rewardId2;

  await t.test('POST /api/admin/rewards - Create Reward', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Reward A',
      description: 'Desc A',
      token_price: 100,
      stock: 10,
      is_active: 'true'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.item.name, 'Reward A');
    rewardId1 = res.body.item._id;
  });

  await t.test('POST /api/admin/rewards - Duplicate Name Validation', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Reward A',
      token_price: 50,
      stock: 5
    });

    assert.strictEqual(res.status, 409);
  });

  await t.test('POST /api/admin/rewards - Create second reward', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Reward B',
      token_price: 50,
      stock: 5
    });

    assert.strictEqual(res.status, 201);
    rewardId2 = res.body.item._id;
  });

  await t.test('PUT /api/admin/rewards/:id - Update Reward', async () => {
    const res = await request('PUT', `/api/admin/rewards/${rewardId2}`, adminToken, {
      name: 'Reward B Updated',
      description: 'New Desc'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.item.name, 'Reward B Updated');
  });

  await t.test('POST /api/admin/rewards - Create reward with image_file_data', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Reward With Image',
      description: 'Has an image',
      token_price: 150,
      stock: 5,
      image_file_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    });
    
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.item.image_url, 'https://res.cloudinary.com/demo/image/upload/v1/mock.png');
  });

  await t.test('PUT /api/admin/rewards/:id - Update reward with image_file_data', async () => {
    const res = await request('PUT', `/api/admin/rewards/${rewardId2}`, adminToken, {
      image_file_data: 'data:image/png;base64,MOCK'
    });
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.item.image_url, 'https://res.cloudinary.com/demo/image/upload/v1/mock.png');
  });

  await t.test('POST /api/admin/rewards - Create reward with image_url only', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Reward With Image URL',
      description: 'Has an image url',
      token_price: 150,
      stock: 5,
      image_url: 'https://example.com/test.png'
    });
    
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.item.image_url, 'https://example.com/test.png');
  });

  await t.test('PUT /api/admin/rewards/:id - Update reward with image_url only', async () => {
    const res = await request('PUT', `/api/admin/rewards/${rewardId2}`, adminToken, {
      image_url: 'https://example.com/updated.png'
    });
    
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.item.image_url, 'https://example.com/updated.png');
  });

  await t.test('POST /api/admin/rewards - Invalid Base64 image_file_data is rejected', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Invalid Base64 Reward',
      token_price: 150,
      stock: 5,
      image_file_data: 'invalid_base64_string'
    });
    
    assert.strictEqual(res.status, 400);
  });

  await t.test('POST /api/admin/rewards - Invalid image_url is rejected', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Invalid URL Reward',
      token_price: 150,
      stock: 5,
      image_url: 'not_a_valid_url'
    });
    
    assert.strictEqual(res.status, 400);
  });

  await t.test('GET /api/admin/rewards/:id - Get Reward Detail', async () => {
    const res = await request('GET', `/api/admin/rewards/${rewardId1}`, adminToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.item.name, 'Reward A');
  });

  await t.test('GET /api/admin/rewards - List Rewards with search and sort', async () => {
    const res = await request('GET', '/api/admin/rewards?search=Updated&sort=token_price&order=asc', adminToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.items.length, 1);
    assert.strictEqual(res.body.items[0].name, 'Reward B Updated');
  });

  await t.test('PATCH /api/admin/rewards/:id/stock - Update Stock (Increase)', async () => {
    const res = await request('PATCH', `/api/admin/rewards/${rewardId1}/stock`, adminToken, {
      operation: 'increase',
      value: 20
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.item.stock, 30);
  });

  await t.test('Redeem Reward - Concurrency Test', async () => {
    // Set stock to 1
    await rewardService.updateRewardStock(adminId, rewardId2, 'set', 1);

    // Two concurrent redemptions
    const [res1, res2] = await Promise.allSettled([
      rewardService.redeemReward(userId, rewardId2),
      rewardService.redeemReward(userId, rewardId2)
    ]);

    const successCount = [res1, res2].filter(r => r.status === 'fulfilled').length;
    const failCount = [res1, res2].filter(r => r.status === 'rejected').length;

    assert.strictEqual(successCount, 1);
    assert.strictEqual(failCount, 1);

    const item = await RewardItem.findById(rewardId2);
    assert.strictEqual(item.stock, 0); // never negative

    // We should have 1 redemption history
    const redemptions = await RedemptionHistory.find({ item_id: rewardId2 });
    assert.strictEqual(redemptions.length, 1);
  });

  await t.test('PUT /api/admin/rewards/:id - Token Price Lock (Cannot modify if redeemed)', async () => {
    const res = await request('PUT', `/api/admin/rewards/${rewardId2}`, adminToken, { token_price: 100 });

    assert.strictEqual(res.status, 400); // 1 redemption exists
  });

  await t.test('POST /api/admin/rewards - Arbitrary positive token price is accepted', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Arbitrary Price Reward',
      description: 'Allows non-standard pricing',
      token_price: 125,
      stock: 10
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.item.token_price, 125);
  });

  await t.test('POST /api/admin/rewards - Decimal token price is rejected', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Decimal Reward',
      token_price: 10.5,
      stock: 10
    });

    assert.strictEqual(res.status, 400);
  });

  await t.test('POST /api/admin/rewards - Zero token price is rejected', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Zero Price Reward',
      token_price: 0,
      stock: 10
    });

    assert.strictEqual(res.status, 400);
  });

  await t.test('POST /api/admin/rewards - Negative token price is rejected', async () => {
    const res = await request('POST', '/api/admin/rewards', adminToken, {
      name: 'Negative Price Reward',
      token_price: -50,
      stock: 10
    });

    assert.strictEqual(res.status, 400);
  });

  let redemptionId;
  await t.test('GET /api/admin/rewards/redemptions - List Redemptions', async () => {
    const res = await request('GET', '/api/admin/rewards/redemptions', adminToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.redemptions.length, 1);
    redemptionId = res.body.redemptions[0]._id;
  });

  await t.test('PATCH /api/admin/rewards/:id/status - Disable Rule (Fail due to pending)', async () => {
    const res = await request('PATCH', `/api/admin/rewards/${rewardId2}/status`, adminToken, { is_active: false });

    assert.strictEqual(res.status, 400); // Because it has a pending redemption
  });

  await t.test('PATCH /api/admin/rewards/redemptions/:id/status - Pending -> Processing', async () => {
    const res = await request('PATCH', `/api/admin/rewards/redemptions/${redemptionId}/status`, adminToken, { status: 'processing' });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.redemption.status, 'processing');
  });

  await t.test('PATCH /api/admin/rewards/redemptions/:id/status - Processing -> Cancelled (Refund & Restore)', async () => {
    // Current stock is 0 for rewardId2
    const currentWallet = await Wallet.findOne({ user_id: userId });

    const res = await request('PATCH', `/api/admin/rewards/redemptions/${redemptionId}/status`, adminToken, { status: 'cancelled' });

    assert.strictEqual(res.status, 200);

    // Check wallet refunded (original token_price was 50)
    const afterWallet = await Wallet.findOne({ user_id: userId });
    assert.strictEqual(afterWallet.token_balance, currentWallet.token_balance + 50);

    // Check stock restored
    const item = await RewardItem.findById(rewardId2);
    assert.strictEqual(item.stock, 1);
  });

  await t.test('PATCH /api/admin/rewards/redemptions/:id/status - Cannot modify cancelled', async () => {
    const res = await request('PATCH', `/api/admin/rewards/redemptions/${redemptionId}/status`, adminToken, { status: 'completed' });

    assert.strictEqual(res.status, 400);
  });

  await t.test('GET /api/admin/rewards/statistics - Statistics endpoint', async () => {
    const res = await request('GET', '/api/admin/rewards/statistics', adminToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.statistics.total_rewards, 5); // Added "Reward With Image" and "Reward With Image URL"
    assert.strictEqual(res.body.statistics.cancelled_redemption, 1);
  });

});
