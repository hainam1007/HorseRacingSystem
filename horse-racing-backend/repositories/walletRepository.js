const { Wallet } = require('../models');

/**
 * Get a user's wallet. If none exists, create one with zero balance atomically.
 * Using upsert ensures no duplicate wallets even under concurrent first-time calls.
 *
 * @param {string|ObjectId} userId
 * @returns {Promise<Wallet>}
 */
async function upsertWallet(userId) {
  return Wallet.findOneAndUpdate(
    { user_id: userId },
    { $setOnInsert: { user_id: userId, token_balance: 0 } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  );
}

/**
 * Atomically increment (or decrement if amount is negative) the token balance.
 * Returns a snapshot of { balanceBefore, balanceAfter, updatedWallet }.
 *
 * The caller is responsible for ensuring a wallet already exists before calling
 * this (via upsertWallet). If no document matches, returns null — which the
 * service layer must handle.
 *
 * @param {string|ObjectId} userId
 * @param {number} amount — positive to credit, negative to debit
 * @returns {Promise<{ balanceBefore: number, balanceAfter: number, wallet: Wallet }|null>}
 */
async function incrementToken(userId, amount) {
  // Fetch current balance first so we can compute balance_before for the audit log.
  // This is a separate read, which is acceptable because the actual mutation
  // (findOneAndUpdate with $inc) is atomic — the balance_before value is only
  // used for logging, not for correctness.
  const current = await Wallet.findOne({ user_id: userId }).lean();

  if (!current) {
    return null;
  }

  const balanceBefore = current.token_balance;

  const updatedWallet = await Wallet.findOneAndUpdate(
    { user_id: userId },
    { $inc: { token_balance: amount } },
    { returnDocument: 'after', runValidators: true }
  );

  return {
    balanceBefore,
    balanceAfter: updatedWallet.token_balance,
    wallet: updatedWallet
  };
}

/**
 * Atomically debit tokens only if the current balance is sufficient.
 * Uses a conditional filter `{ token_balance: { $gte: amount } }` so the
 * decrement never executes when balance is too low — no separate read needed.
 *
 * Returns null when the balance was insufficient (document not matched).
 *
 * @param {string|ObjectId} userId
 * @param {number} amount — must be a positive number
 * @returns {Promise<{ balanceBefore: number, balanceAfter: number, wallet: Wallet }|null>}
 */
async function deductTokenIfSufficient(userId, amount) {
  const current = await Wallet.findOne({ user_id: userId }).lean();

  if (!current || current.token_balance < amount) {
    return null;
  }

  const balanceBefore = current.token_balance;

  // Only decrement when balance is still >= amount at the moment of the write.
  // This guards against a concurrent deduction that races between our read and write.
  const updatedWallet = await Wallet.findOneAndUpdate(
    { user_id: userId, token_balance: { $gte: amount } },
    { $inc: { token_balance: -amount } },
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedWallet) {
    return null;
  }

  return {
    balanceBefore,
    balanceAfter: updatedWallet.token_balance,
    wallet: updatedWallet
  };
}

module.exports = {
  upsertWallet,
  incrementToken,
  deductTokenIfSufficient
};
