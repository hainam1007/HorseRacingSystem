const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ODDS_MARKET_STATUS } = require('../constants/statuses');

const raceOddsMarketSchema = new Schema(
  {
    race_id: {
      type: Schema.Types.ObjectId,
      ref: 'Race',
      required: true,
      unique: true
    },
    status: {
      type: String,
      enum: Object.values(ODDS_MARKET_STATUS),
      default: ODDS_MARKET_STATUS.GENERATED,
      index: true
    },
    model_name: {
      type: String,
      default: 'probability_engine_history_v1',
      trim: true
    },
    model_version: {
      type: String,
      default: 'history_v1.0.0',
      trim: true
    },
    source: {
      type: String,
      default: 'app_probability_engine_history_v1_runtime',
      trim: true
    },
    payout_factor: {
      type: Number,
      default: 0.85,
      min: 0,
      max: 1
    },
    model_input_version: {
      type: Number,
      default: 0,
      min: 0
    },
    input_snapshot: {
      type: Schema.Types.Mixed,
      default: {}
    },
    generated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    generated_at: {
      type: Date,
      default: Date.now,
      index: true
    },
    manually_adjusted_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    manually_adjusted_at: Date,
    manual_adjustment_note: {
      type: String,
      trim: true,
      maxlength: 500
    },
    model_metrics: {
      type: Schema.Types.Mixed,
      default: {}
    },
    input_diagnostics: {
      participant_count: Number,
      fallback_count: Number,
      fallbacks_used: [String],
      race_payload_id: String
    },
    odds: [
      {
        horse_id: {
          type: Schema.Types.ObjectId,
          ref: 'Horse',
          required: true,
          index: true
        },
        jockey_id: {
          type: Schema.Types.ObjectId,
          ref: 'Jockey',
          index: true
        },
        horse_no: Number,
        horse_name: {
          type: String,
          trim: true
        },
        jockey_name: {
          type: String,
          trim: true
        },
        win_probability: {
          type: Number,
          required: true,
          min: 0,
          max: 1
        },
        fair_odds: {
          type: Number,
          required: true,
          min: 1
        },
        game_odds: {
          type: Number,
          required: true,
          min: 1
        },
        generated_game_odds: {
          type: Number,
          min: 1
        },
        probability_rank: {
          type: Number,
          required: true,
          min: 1
        },
        fallbacks_used: [String]
      }
    ]
  },
  {
    collection: 'race_odds_markets',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

raceOddsMarketSchema.index({ race_id: 1, status: 1 });

module.exports = mongoose.model('RaceOddsMarket', raceOddsMarketSchema);
