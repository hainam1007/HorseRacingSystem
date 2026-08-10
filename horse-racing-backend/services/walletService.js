const ApiError = require('../utils/ApiError');
const { VND_PER_TOKEN } = require('../constants/depositConstants');
const walletRepository = require('../repositories/walletRepository');
const transactionRepository = require('../repositories/transactionRepository');

async function getOrCreateWallet(userId) {
  const wallet = await walletRepository.upsertWallet(userId);
  return { wallet };
}

async function depositToken(userId, vndAmount, referenceId) {
  if (!vndAmount || typeof vndAmount !== 'number' || vndAmount < VND_PER_TOKEN) {
    throw new ApiError(400, `Minimum deposit is ${VND_PER_TOKEN.toLocaleString()} VND (= 1 Token)`);
  }

  const cleanRef = (referenceId || '').trim();
  if (!cleanRef) {
    throw new ApiError(400, 'reference_id is required for payment idempotency');
  }
  //Idempotency check
  const existing = await transactionRepository.checkExistsByReference(cleanRef);
  if (existing) {
    throw new ApiError(409, 'This payment reference has already been processed', {
      reference_id: cleanRef,
      processed_at: existing.created_at
    });
  }

  const tokenAmount = Math.floor(vndAmount / VND_PER_TOKEN);
  if (tokenAmount < 1) {
    throw new ApiError(400, 'VND amount too small to convert to tokens');
  }

  await walletRepository.upsertWallet(userId);

  const { balanceBefore, balanceAfter, wallet } = await walletRepository.incrementToken(userId, tokenAmount);

  let transaction;
  try {
    transaction = await transactionRepository.createLog({
      user_id: userId,
      transaction_type: 'deposit',
      amount: tokenAmount,
      direction: 'credit',
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      status: 'completed',
      reference_id: cleanRef,
      note: `Deposited ${vndAmount.toLocaleString()} VND → ${tokenAmount} Token(s)`
    });
  } catch (err) {
    if (err.code === 11000) {
      await walletRepository.incrementToken(userId, -tokenAmount);
      throw new ApiError(409, 'This payment reference has already been processed');
    }
    throw err;
  }

  return { wallet, transaction };
}

async function getTransactionHistory(userId, query = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.type) {
    const allowed = ['deposit', 'bet_deduct', 'bet_refund', 'bet_win', 'race_prize', 'redeem', 'registration_fee', 'registration_refund'];
    if (!allowed.includes(query.type)) {
      throw new ApiError(400, `Invalid transaction type. Must be one of: ${allowed.join(', ')}`);
    }
    filter.transaction_type = query.type;
  }

  const [transactions, total] = await Promise.all([
    transactionRepository.findByUserId(userId, filter, { skip, limit }),
    transactionRepository.countByUserId(userId, filter)
  ]);

  return {
    transactions,
    meta: { total, page, limit, total_pages: Math.ceil(total / limit) }
  };
}

module.exports = {
  getOrCreateWallet,
  depositToken,
  getTransactionHistory
};
