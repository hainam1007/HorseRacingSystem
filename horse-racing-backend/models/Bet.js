const mongoose = require('mongoose');

const { Schema } = mongoose;
const { BET_STATUS } = require('../constants/statuses');

const betSchema = new Schema(
  {
    spectator_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    race_id: {
      type: Schema.Types.ObjectId,
      ref: 'Race',
      required: true,
      index: true
    },
    predicted_horse_id: {
      type: Schema.Types.ObjectId,
      ref: 'Horse',
      required: true,
      index: true
    },
    stake_amount: {
      type: Number,
      required: true,
      min: [1, 'Stake amount must be at least 1 Token']
    },
    odds_market_id: {
      type: Schema.Types.ObjectId,
      ref: 'RaceOddsMarket',
      index: true
    },
    odds_snapshot: {
      market_id: Schema.Types.ObjectId,
      model_name: String,
      model_version: String,
      generated_at: Date,
      payout_factor: Number,
      horse_no: Number,
      horse_name: String,
      win_probability: Number,
      fair_odds: Number,
      game_odds: Number,
      probability_rank: Number
    },
    potential_payout: {
      type: Number,
      required: true,
      min: 0
    },
    payout_amount: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: Object.values(BET_STATUS),
      default: BET_STATUS.PENDING,
      trim: true
    },
    settled_result_id: {
      type: Schema.Types.ObjectId,
      ref: 'RaceResult',
      index: true
    },
    settled_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    settled_at: Date,
    submitted_at: {
      type: Date,
      default: Date.now
    },
    checked_at: Date
  },
  {
    collection: 'bets',
    versionKey: false
  }
);

betSchema.index({ spectator_id: 1, submitted_at: -1 });
betSchema.index({ race_id: 1, status: 1 });

module.exports = mongoose.model('Bet', betSchema);
