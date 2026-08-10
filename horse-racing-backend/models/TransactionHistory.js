const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Immutable audit log for every token movement.
 * Never delete or update rows — only INSERT (create).
 */
const transactionHistorySchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    /**
     * deposit    — user topped up VND → received Tokens
     * bet_deduct — tokens deducted when placing a bet
     * bet_win    — tokens credited when a bet is won
     * race_prize — tokens credited as race prize award
     * redeem     — tokens deducted when redeeming a reward item
     */
    transaction_type: {
      type: String,
      required: true,
      enum: ['deposit', 'bet_deduct', 'bet_refund', 'bet_win', 'race_prize', 'redeem', 'registration_fee', 'registration_refund'],
      trim: true
    },
    /**
     * Always a positive number representing the magnitude of the change.
     * Use `direction` to know whether it was added or removed.
     */
    amount: {
      type: Number,
      required: true,
      min: [0, 'Transaction amount must be non-negative']
    },
    /** credit = tokens added to wallet; debit = tokens removed from wallet */
    direction: {
      type: String,
      required: true,
      enum: ['credit', 'debit']
    },
    /** Snapshot of balance immediately BEFORE this transaction was applied */
    balance_before: {
      type: Number,
      required: true
    },
    /** Snapshot of balance immediately AFTER this transaction was applied */
    balance_after: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      default: 'completed',
      enum: ['pending', 'completed', 'failed'],
      trim: true
    },
    /**
     * External idempotency key (e.g. payment-gateway order ID).
     * Used to prevent double-processing the same webhook call.
     * Sparse index allows multiple documents with no reference_id.
     */
    reference_id: {
      type: String,
      trim: true,
      index: { unique: true, sparse: true }
    },
    /** Human-readable description or internal note */
    note: {
      type: String,
      trim: true
    }
  },
  {
    collection: 'transaction_histories',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('TransactionHistory', transactionHistorySchema);
