const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

// ─── Import Services ─────────────────────────────────────────────────────────
const depositService = require('../services/depositService');
const betService = require('../services/betService');
const rewardService = require('../services/rewardService');
const paymentGatewayService = require('../services/paymentGatewayService');

// ─── Import Repositories & Models ────────────────────────────────────────────
const depositRequestRepository = require('../repositories/depositRequestRepository');
const walletRepository = require('../repositories/walletRepository');
const transactionRepository = require('../repositories/transactionRepository');
const betRepository = require('../repositories/betRepository');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const raceRepository = require('../repositories/raceRepository');
const rewardRepository = require('../repositories/rewardRepository');
const { RaceResult } = require('../models');
const { BET_STATUS } = require('../constants/statuses');
const { DEPOSIT_REQUEST_STATUS } = require('../constants/depositStatuses');

// ─── Save Original Methods for Teardown ──────────────────────────────────────
const originals = {
  paymentGatewayService: {
    verifySignature: paymentGatewayService.verifySignature,
    isPaymentSuccess: paymentGatewayService.isPaymentSuccess,
    extractGatewayTransactionId: paymentGatewayService.extractGatewayTransactionId
  },
  depositRequestRepository: {
    findByOrderId: depositRequestRepository.findByOrderId,
    markSuccess: depositRequestRepository.markSuccess
  },
  walletRepository: {
    incrementToken: walletRepository.incrementToken,
    deductTokenIfSufficient: walletRepository.deductTokenIfSufficient,
    upsertWallet: walletRepository.upsertWallet
  },
  transactionRepository: {
    createLog: transactionRepository.createLog,
    checkExistsByReference: transactionRepository.checkExistsByReference
  },
  betRepository: {
    findPendingByRaceId: betRepository.findPendingByRaceId,
    updateById: betRepository.updateById,
    create: betRepository.create,
    findById: betRepository.findById
  },
  raceOddsMarketRepository: {
    findByRaceId: raceOddsMarketRepository.findByRaceId,
    updateByRaceId: raceOddsMarketRepository.updateByRaceId
  },
  raceRepository: {
    findById: raceRepository.findById,
    updateById: raceRepository.updateById
  },
  rewardRepository: {
    findActiveItem: rewardRepository.findActiveItem,
    deductStock: rewardRepository.deductStock,
    createRedemption: rewardRepository.createRedemption
  },
  RaceResult: {
    find: RaceResult.find
  }
};

test.afterEach(() => {
  // Restore all original functions
  Object.assign(paymentGatewayService, originals.paymentGatewayService);
  Object.assign(depositRequestRepository, originals.depositRequestRepository);
  Object.assign(walletRepository, originals.walletRepository);
  Object.assign(transactionRepository, originals.transactionRepository);
  Object.assign(betRepository, originals.betRepository);
  Object.assign(raceOddsMarketRepository, originals.raceOddsMarketRepository);
  Object.assign(raceRepository, originals.raceRepository);
  Object.assign(rewardRepository, originals.rewardRepository);
  RaceResult.find = originals.RaceResult.find;
});

test('End-to-End Financial Flow: Deposit -> Bet -> Payout -> Redeem', async () => {
  // ─── 1. Setup Mock State ───────────────────────────────────────────────────
  const userId = new mongoose.Types.ObjectId();
  const orderId = 'ORDER-12345';
  const raceId = new mongoose.Types.ObjectId();
  const horseId = new mongoose.Types.ObjectId();
  const marketId = new mongoose.Types.ObjectId();
  const itemId = new mongoose.Types.ObjectId();
  const resultId = new mongoose.Types.ObjectId();

  let walletBalance = 0;
  let rewardStock = 5;

  const dbOrders = {
    [orderId]: {
      order_id: orderId,
      user_id: userId,
      package_id: 'PKG_100K',
      total_vnd: 100000,
      total_token: 115, // 100 base + 15 bonus
      payment_method: 'MOCK',
      status: DEPOSIT_REQUEST_STATUS.PENDING
    }
  };
  const dbTransactions = [];
  const dbBets = [];
  const dbRedemptions = [];

  // ─── Mock Injections ───────────────────────────────────────────────────────
  
  // Gateway
  paymentGatewayService.verifySignature = () => ({ valid: true });
  paymentGatewayService.isPaymentSuccess = () => true;
  paymentGatewayService.extractGatewayTransactionId = () => 'GW12345';

  // Deposit Orders
  depositRequestRepository.findByOrderId = async (id) => dbOrders[id];
  depositRequestRepository.markSuccess = async (id, gwRef) => {
    dbOrders[id].status = DEPOSIT_REQUEST_STATUS.SUCCESS;
    dbOrders[id].gateway_reference_id = gwRef;
    return dbOrders[id];
  };

  // Wallet Atomic Operations
  walletRepository.upsertWallet = async () => ({ token_balance: walletBalance });
  walletRepository.incrementToken = async (uid, amount) => {
    const before = walletBalance;
    walletBalance += amount;
    return { balanceBefore: before, balanceAfter: walletBalance, wallet: { token_balance: walletBalance } };
  };
  walletRepository.deductTokenIfSufficient = async (uid, amount) => {
    if (walletBalance >= amount) {
      const before = walletBalance;
      walletBalance -= amount;
      return { balanceBefore: before, balanceAfter: walletBalance, wallet: { token_balance: walletBalance } };
    }
    return null; // Atomic deduction fails
  };

  // Transactions Audit Trail
  transactionRepository.checkExistsByReference = async (ref) => dbTransactions.find(t => t.reference_id === ref);
  transactionRepository.createLog = async (data) => {
    data._id = new mongoose.Types.ObjectId();
    dbTransactions.push(data);
    return data;
  };

  // Betting & Race
  raceOddsMarketRepository.findByRaceId = async () => ({
    _id: marketId,
    race_id: { _id: raceId, status: 'scheduled', betting_market: { min_stake: 1, max_stake: 1000 } },
    status: 'open',
    odds: [{ horse_id: horseId, game_odds: 2.0 }]
  });
  raceOddsMarketRepository.updateByRaceId = async () => {};

  raceRepository.findById = async () => ({
    _id: raceId,
    status: 'scheduled',
    betting_market: { min_stake: 1, max_stake: 1000 }
  });
  raceRepository.updateById = async () => {};

  betRepository.create = async (data) => {
    data._id = new mongoose.Types.ObjectId();
    dbBets.push(data);
    return data;
  };
  betRepository.findById = async (id) => dbBets.find(b => b._id.toString() === id.toString());
  betRepository.findPendingByRaceId = async (rId) => dbBets.filter(b => b.race_id.toString() === rId.toString() && b.status === BET_STATUS.PENDING);
  betRepository.updateById = async (id, data) => {
    const bet = dbBets.find(b => b._id.toString() === id.toString());
    Object.assign(bet, data);
    return bet;
  };

  RaceResult.find = async () => ([
    { _id: resultId, race_id: raceId, horse_id: horseId, final_position: 1, status: 'published' }
  ]);

  // Rewards
  rewardRepository.findActiveItem = async (id) => ({
    _id: id,
    name: 'T-Shirt',
    token_price: 50,
    stock: rewardStock
  });
  rewardRepository.deductStock = async (id) => {
    if (rewardStock > 0) {
      rewardStock -= 1;
      return { _id: id, stock: rewardStock };
    }
    return null; // Atomic stock deduction fails
  };
  rewardRepository.createRedemption = async (data) => {
    data._id = new mongoose.Types.ObjectId();
    dbRedemptions.push(data);
    return data;
  };


  // ─── 2. Test Flow Execution & Assertions ───────────────────────────────────

  // STEP A: DEPOSIT (Webhook receives payment notification)
  const depositWebhookPayload = { order_id: orderId };
  await depositService.handlePaymentWebhook(depositWebhookPayload, 'MOCK');

  assert.equal(walletBalance, 115, 'Wallet should have 115 tokens after deposit (100 base + 15 bonus)');
  assert.equal(dbOrders[orderId].status, DEPOSIT_REQUEST_STATUS.SUCCESS, 'Order status should be updated to SUCCESS');
  assert.equal(dbTransactions.length, 1, 'Should have 1 transaction log');
  assert.equal(dbTransactions[0].transaction_type, 'deposit', 'Transaction type should be deposit');
  assert.equal(dbTransactions[0].amount, 115, 'Transaction amount should match total_token');


  // STEP B: BETTING (User places a 40 token bet)
  const placeBetReq = { user: { _id: userId } };
  const placeBetPayload = { race_id: raceId, predicted_horse_id: horseId, stake_amount: 40 };
  
  await betService.placeBet(placeBetReq, placeBetPayload);

  assert.equal(walletBalance, 75, 'Wallet should have 75 tokens remaining (115 - 40)');
  assert.equal(dbBets.length, 1, '1 Bet record should be created');
  assert.equal(dbBets[0].status, BET_STATUS.PENDING, 'Bet should be PENDING');
  assert.equal(dbBets[0].potential_payout, 80, 'Potential payout should be 80 (40 stake * 2.0 odds)');
  assert.equal(dbTransactions.length, 2, 'Should have 2 transaction logs now');
  assert.equal(dbTransactions[1].transaction_type, 'bet_deduct', 'Second transaction should be bet_deduct');


  // STEP C: PAYOUT (Race ends, bets are settled)
  await betService.settleRaceBets(raceId, new mongoose.Types.ObjectId()); // 2nd arg is admin's user_id

  assert.equal(walletBalance, 155, 'Wallet should have 155 tokens after winning 80 token payout (75 + 80)');
  assert.equal(dbBets[0].status, BET_STATUS.WON, 'Bet status should be updated to WON');
  assert.equal(dbTransactions.length, 3, 'Should have 3 transaction logs now');
  assert.equal(dbTransactions[2].transaction_type, 'bet_win', 'Third transaction should be bet_win payout');


  // STEP D: REDEEM REWARD (User buys a 50 token reward)
  await rewardService.redeemReward(userId, itemId);

  assert.equal(walletBalance, 105, 'Wallet should have 105 tokens remaining after redeeming 50-token item (155 - 50)');
  assert.equal(rewardStock, 4, 'Reward stock should decrease from 5 to 4 atomically');
  assert.equal(dbRedemptions.length, 1, '1 Redemption record should be created');
  assert.equal(dbTransactions.length, 4, 'Should have 4 transaction logs now');
  assert.equal(dbTransactions[3].transaction_type, 'redeem', 'Fourth transaction should be redeem deduction');
});
